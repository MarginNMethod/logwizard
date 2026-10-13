// Engine glue. Every decision (routing, reminders, digests, send caps, alerts, validation) is made by
// @logwizard/engine-logic or @logwizard/plan-schema. This file only reads, writes, and sends via Services.
import {
  DAILY_CAPS,
  META_HEADERS,
  addDays,
  alertsForSubmission,
  buildDigest,
  digestsToSend,
  dueReminders,
  headersForLog,
  logFields,
  makeEntryId,
  normaliseEntry,
  normaliseValue,
  planRouting,
  planSends,
  sanitizeCellValue,
  zonedParts,
} from "@logwizard/engine-logic";
import type { Entry, EntryValue, Plan, PlanField, PlanLog, RowsByLog } from "@logwizard/engine-logic";
import { MAX_PLAN_BYTES, validatePlan } from "@logwizard/plan-schema";
import { alertEmail, buildOutgoing, testEmail } from "./mail.js";
import type { Outgoing } from "./mail.js";
import { buildSidebarHtml } from "./sidebar.js";
import type { ColumnRule, FormItemSpec, FormSpec, FormSubmission, Services } from "./services.js";

/** Required fallback question (Spike 4 pending): used when Google does not pass the respondent email. */
export const NAME_QUESTION = "Your name";
export const ACTIVITY_HEADERS = ["When", "Level", "Message"];

/** Named trigger inventory. Activate removes only triggers whose handler is listed here. */
export const TRIGGER_INVENTORY = [
  { name: "hourly", handler: "hourlyTick", kind: "time" },
  { name: "form_submit", handler: "onFormSubmit", kind: "form" },
] as const;

const IMPORT_FROM_PROP = "importFrom";
const ALERT_DAY_PROP = "alertDay";
const ALERT_HOUR_PROP = "alertHour";
const ALERT_NOTICE_PROP = "alertNotice";
/** Alerts may use at most half of the day's emails and this many per hour, so reminders and digests always have room. */
export const ALERTS_PER_HOUR = 10;
const LOCK_ATTEMPTS = 3;
const NAME_MAX = 80;
const SENT_PREFIX = "sent:";
const COUNT_PROP = "sendCount";
const NOTICE_PROP = "capNotice";
const formProp = (logId: string) => `formId:${logId}`;
const verifiedProp = (formId: string) => `verified:${formId}`;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const isBusy = (e: unknown): boolean => /Lock timeout/.test(errText(e));

/** Run fn under the script lock, retrying a busy lock a few times. Never nest calls. */
function locked<T>(svc: Services, fn: () => T): T {
  let last: unknown;
  for (let i = 0; i < LOCK_ATTEMPTS; i++) {
    try {
      return svc.withLock(fn);
    } catch (e) {
      if (!isBusy(e)) throw e;
      last = e;
    }
  }
  throw last;
}

/** One warning per key per local day, so an hourly check cannot flood Activity. */
function warnOnce(svc: Services, key: string, date: string, message: string): void {
  if (svc.getProp(`warned:${key}`) === date) return;
  svc.setProp(`warned:${key}`, date);
  logActivity(svc, "warning", message);
}

/** Name of the built-in "who are you" question. Never equal to a plan field label (ignoring case). */
export function nameQuestionTitle(plan: Plan, logId: string): string {
  const labels = new Set(logFields(plan, logId).map((f) => f.label.trim().toLowerCase()));
  let title = NAME_QUESTION;
  for (let n = 1; labels.has(title.toLowerCase()); n++) title = n === 1 ? `${NAME_QUESTION} (contributor)` : `${NAME_QUESTION} (contributor ${n})`;
  return title;
}

/** Text typed by a contributor: no control characters, one line, at most 80 characters. */
export function cleanName(raw: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(raw ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
}

// ---------- column layout (everything is read and written by heading name) ----------

const same = (a: string, b: string) => a.trim() === b.trim();

/** For each expected heading, the column of the tab that holds it, or null when one is missing. */
function columnMap(actual: readonly string[], expected: readonly string[]): number[] | null {
  const used = new Set<number>();
  const map: number[] = [];
  for (const h of expected) {
    const i = actual.findIndex((a, j) => !used.has(j) && same(a, h));
    if (i < 0) return null;
    used.add(i);
    map.push(i);
  }
  return map;
}

type Layout = { ok: true; map: number[]; width: number; headers: string[] } | { ok: false; message: string };

function layoutFor(svc: Services, plan: Plan, log: PlanLog): Layout {
  const actual = svc.readHeaders(log.name);
  if (!actual) return { ok: false, message: `The tab "${log.name}" is missing or has no column headings, so nothing was written to or read from it. Run Activate again.` };
  const want = headersForLog(plan, log.id);
  const map = columnMap(actual, want);
  if (!map) {
    const missing = want.filter((h) => !actual.some((a) => same(a, h)));
    return {
      ok: false,
      message: `The tab "${log.name}" is missing the column heading(s) ${missing.map((m) => `"${m}"`).join(", ")} that the plan expects, so nothing was written to or read from it. Rename the old tab (for example to "${log.name} old") and run Activate again.`,
    };
  }
  return { ok: true, map, width: actual.length, headers: actual };
}

const alignRow = (cells: string[], lay: { map: number[]; width: number }): string[] => {
  const out = Array<string>(lay.width).fill("");
  cells.forEach((c, i) => {
    out[lay.map[i]!] = c;
  });
  return out;
};

// Real Google evaluates a string starting with "=" passed to setValues even in an "@" (plain text) cell (H2 finding),
// so every data cell is protected here with one leading apostrophe. Rule: a cell needs the apostrophe when, after any
// leading apostrophes, it starts with optional spaces/nbsp then = + - @, or with a tab or CR. Reading strips exactly
// one apostrophe from a cell that matches the same pattern, so a literal "'=x" is stored as "''=x" and reads back as "'=x".
const GUARDED = /^'*(?:[ \u00a0]*[=+\-@]|[\t\r])/;
const unprefix = (cell: string): string => (cell.startsWith("'") && GUARDED.test(cell) ? cell.slice(1) : cell);

/** Control-stripped text of a value, before any protective apostrophe (same text the engine sanitiser works on). */
const plainText = (v: unknown): string => {
  if (typeof v === "string" || Array.isArray(v)) return sanitizeCellValue(`~${Array.isArray(v) ? v.map(String).join(", ") : v}`).slice(1);
  return sanitizeCellValue(v);
};

/**
 * Cells for one row in header order, ready for setValues. Meta and field text get the protective apostrophe,
 * except a value that is exactly one of the allowed options of a strict list column (choice, yes_no): the plan
 * validator already vetted those, and an apostrophe would make them fail the list validation.
 */
function protectedCells(plan: Plan, logId: string, entry: Entry): string[] {
  const options = new Map<number, Set<string>>();
  for (const r of rulesFor(plan, logId)) if (r.kind === "list") options.set(r.column - 1, new Set(r.options ?? []));
  const raw = [entry.id, entry.enteredBy, entry.enteredAt ?? "", ...logFields(plan, logId).map((f) => entry.values[f.key])];
  return raw.map((v, i) => {
    const t = plainText(v);
    if (!GUARDED.test(t)) return t;
    return options.get(i)?.has(t) && !t.startsWith("'") ? t : `'${t}`;
  });
}

export type LoadResult = { ok: true; plan: Plan } | { ok: false; message: string };

export function loadPlan(svc: Services): LoadResult {
  const text = svc.readPlanText();
  if (!text || !text.trim()) return { ok: false, message: "No plan was found. The hidden _plan tab is empty or missing." };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "The plan in the _plan tab could not be read. It is not valid JSON." };
  }
  const r = validatePlan(data);
  if (r.ok) return { ok: true, plan: r.plan };
  const lines = r.errors.slice(0, 10).map((e) => `- ${e.message}`);
  return { ok: false, message: `The plan has problems, so nothing was changed:\n${lines.join("\n")}` };
}

export function logActivity(svc: Services, level: "info" | "warning" | "error", message: string): void {
  try {
    svc.ensureInfoTab("Activity", ACTIVITY_HEADERS);
    svc.appendRows("Activity", [[svc.now().toISOString(), level, sanitizeCellValue(message)]]);
  } catch {
    // Logging must never break the caller.
  }
}

const baseLogs = (plan: Plan): PlanLog[] => plan.logs.filter((l) => l.fields);

export function dailyCapFor(email: string): number {
  return /@(gmail|googlemail)\.com$/i.test(email.trim()) ? DAILY_CAPS.personal : DAILY_CAPS.workspace;
}

// ---------- tab and form specs ----------

function rulesFor(plan: Plan, logId: string): ColumnRule[] {
  const out: ColumnRule[] = [];
  logFields(plan, logId).forEach((f, i) => {
    const column = META_HEADERS.length + i + 1;
    if (f.type === "choice") out.push({ column, kind: "list", options: [...(f.options ?? [])] });
    else if (f.type === "yes_no") out.push({ column, kind: "list", options: ["Yes", "No"] });
    else if (f.type === "date" || f.type === "email" || f.type === "url" || f.type === "number") out.push({ column, kind: f.type });
  });
  return out;
}

const FORM_KIND: Record<PlanField["type"], FormItemSpec["kind"]> = {
  text: "text", long_text: "paragraph", email: "email", phone: "phone", date: "date", number: "number",
  choice: "list", multi_choice: "checkbox", yes_no: "yes_no", url: "url",
};

function formSpec(plan: Plan, log: PlanLog): FormSpec {
  const items: FormItemSpec[] = [
    { title: nameQuestionTitle(plan, log.id), kind: "text", required: true, help: "Used to record who entered this. Please use your own name." },
    ...logFields(plan, log.id).map((f) => {
      const item: FormItemSpec = { title: f.label, kind: FORM_KIND[f.type], required: f.required };
      if (f.options) item.options = [...f.options];
      return item;
    }),
  ];
  return { title: `${plan.system_name}: ${log.name}`, description: `Add a new entry to ${plan.system_name}.`, items };
}

// ---------- activate ----------

export interface ActivateResult {
  ok: boolean;
  message: string;
}

const isPrefix = (short: readonly string[], long: readonly string[]) => short.length <= long.length && short.every((h, i) => same(h, long[i]!));

function headingProblem(log: PlanLog, have: readonly string[], want: readonly string[]): string {
  const missing = want.filter((h) => !have.some((a) => same(a, h)));
  const extra = have.filter((a) => !want.some((h) => same(a, h)));
  const parts = [`The tab "${log.name}" has different column headings than the plan, so it was left as it is and nothing was set up for it. Your data was not changed.`];
  if (missing.length) parts.push(`Missing from the tab: ${missing.map((m) => `"${m}"`).join(", ")}.`);
  if (extra.length) parts.push(`In the tab but not in the plan: ${extra.map((m) => `"${m}"`).join(", ")}.`);
  if (!missing.length && !extra.length) parts.push("The same headings are in a different order.");
  parts.push(`To fix this, rename the old tab (for example to "${log.name} old") and run Activate again. A new tab with the right columns will be built. You can copy your old rows across.`);
  return parts.join(" ");
}

export function activate(svc: Services): ActivateResult {
  const loaded = loadPlan(svc);
  if (!loaded.ok) {
    logActivity(svc, "error", `Activate stopped. ${loaded.message}`);
    return { ok: false, message: loaded.message };
  }
  const plan = loaded.plan;
  svc.ensureInfoTab("Activity", ACTIVITY_HEADERS);
  svc.ensureInfoTab("Setup", ["Setting", "Value"]);
  svc.setSpreadsheetTimeZone(plan.time_zone);

  const blocked = new Set<string>();
  for (const log of plan.logs) {
    const want = headersForLog(plan, log.id);
    const have = svc.readHeaders(log.name);
    if (have && !isPrefix(want, have)) {
      if (isPrefix(have, want)) {
        // A field was added at the end of the plan: add just the new headings. Existing columns and data stay put.
        const extra = want.slice(have.length);
        svc.appendHeaders(log.name, extra);
        logActivity(svc, "info", `Added the new column heading(s) ${extra.map((e) => `"${e}"`).join(", ")} to the end of "${log.name}".`);
      } else {
        blocked.add(log.id);
        logActivity(svc, "warning", headingProblem(log, have, want));
        continue;
      }
    }
    svc.ensureLogTab({ name: log.name, headers: want, rules: rulesFor(plan, log.id) });
  }

  const forms: { log: PlanLog; url: string }[] = [];
  let installed = 0;
  const activatedAt = svc.now().toISOString();
  locked(svc, () => {
    const formIds: string[] = [];
    for (const log of baseLogs(plan)) {
      if (blocked.has(log.id)) continue;
      const info = svc.ensureForm(formSpec(plan, log), svc.getProp(formProp(log.id)));
      svc.setProp(formProp(log.id), info.id);
      svc.setProp(verifiedProp(info.id), info.verifiedEmail ? "1" : "0");
      forms.push({ log, url: info.url });
      formIds.push(info.id);
      if (info.addedItems.length) logActivity(svc, "info", `Added new questions to the form for "${log.name}": ${info.addedItems.join(", ")}.`);
      if (info.updatedItems.length) logActivity(svc, "info", `Updated the choices or required setting of these questions in the form for "${log.name}": ${info.updatedItems.join(", ")}.`);
      if (!info.verifiedEmail) {
        logActivity(svc, "warning", `The form for "${log.name}" could not be set to verified email collection. Until it is, the engine treats every form email as unverified, so the owner is still alerted about each entry.`);
      }
    }

    // Remove only this engine's own old triggers, then install the inventory.
    const own = new Set<string>(TRIGGER_INVENTORY.map((t) => t.handler));
    for (const t of svc.listTriggers()) if (own.has(t.handler)) svc.deleteTrigger(t.id);
    for (const t of TRIGGER_INVENTORY) {
      if (t.kind === "time") {
        svc.createHourlyTrigger(t.handler);
        installed++;
      } else {
        for (const id of formIds) {
          svc.createFormSubmitTrigger(id, t.handler);
          installed++;
        }
      }
    }
  });

  svc.setProp("activatedAt", activatedAt);
  if (!svc.getProp(IMPORT_FROM_PROP)) svc.setProp(IMPORT_FROM_PROP, activatedAt);
  const problems = plan.logs.filter((l) => blocked.has(l.id));
  const rows: string[][] = [
    ["Setting", "Value"],
    ["System", plan.system_name],
    ["Activated at", activatedAt],
    ["Owner", plan.owner.email],
    ["Time zone", plan.time_zone],
    ["Triggers installed", `${installed} (hourly check, form submit)`],
    ["Daily email limit", String(dailyCapFor(plan.owner.email))],
    ...forms.map((f) => [`Form for "${f.log.name}"`, f.url]),
    ...problems.map((l) => [`Problem with "${l.name}"`, "Different column headings. Rename the old tab and run Activate again. See Activity."]),
    ["Note", "Contributors use the form links above. They do not need to approve anything."],
  ];
  svc.replaceSetup(rows.map((r) => r.map((c) => sanitizeCellValue(c))));
  logActivity(svc, "info", `Activated. ${installed} trigger(s) installed and ${forms.length} form(s) ready.${problems.length ? ` ${problems.length} log(s) were skipped.` : ""}`);
  if (problems.length) {
    return { ok: true, message: `Activated, but ${problems.length} log(s) were skipped because their tab headings differ from the plan: ${problems.map((l) => `"${l.name}"`).join(", ")}. See the Activity tab for what to do.` };
  }
  return { ok: true, message: `Activated. See the Setup tab for the form link${forms.length === 1 ? "" : "s"}.` };
}

// ---------- reading rows ----------

function parseValue(f: PlanField, raw: string, onBadDate?: (label: string) => void): EntryValue {
  if (f.type === "multi_choice") return raw.split(",").map((x) => x.trim()).filter(Boolean);
  if (f.type === "number" && raw !== "" && Number.isFinite(Number(raw))) return Number(raw);
  if (f.type === "date") {
    const r = normaliseValue({ ...f, required: false }, raw);
    if (r.ok) return r.value;
    onBadDate?.(f.label);
    return "";
  }
  return raw;
}

/** Row to Entry. `headers` are the tab's real headings, so columns are found by name and not by position. */
export function rowToEntry(plan: Plan, logId: string, row: string[], headers?: string[], onBadDate?: (label: string) => void): Entry {
  const expected = headersForLog(plan, logId);
  const map = headers ? columnMap(headers, expected) : null;
  const cell = (i: number): string => unprefix(row[map ? map[i]! : i] ?? "");
  const values: Record<string, EntryValue> = {};
  logFields(plan, logId).forEach((f, i) => {
    values[f.key] = parseValue(f, cell(META_HEADERS.length + i), onBadDate);
  });
  const entry: Entry = { id: cell(0), enteredBy: cell(1), values };
  const at = cell(2);
  if (at) entry.enteredAt = at;
  return entry;
}

type LogRows = { ok: true; headers: string[]; rows: string[][] } | { ok: false; message: string };

function readLog(svc: Services, plan: Plan, log: PlanLog): LogRows {
  const lay = layoutFor(svc, plan, log);
  if (!lay.ok) return lay;
  return { ok: true, headers: lay.headers, rows: svc.readRows(log.name) };
}

function loadRows(svc: Services, plan: Plan, date: string): RowsByLog {
  const out: Record<string, Entry[]> = {};
  for (const log of plan.logs) {
    const r = readLog(svc, plan, log);
    if (!r.ok) {
      warnOnce(svc, `layout:${log.id}`, date, r.message);
      out[log.id] = [];
      continue;
    }
    let bad = 0;
    out[log.id] = r.rows
      .map((row) => rowToEntry(plan, log.id, row, r.headers, () => bad++))
      .filter((e) => e.id !== "");
    if (bad) {
      warnOnce(svc, `date:${log.id}`, date, `${bad} date cell(s) in "${log.name}" could not be read as dates (use a form like 2026-03-01), so those dates are ignored until they are fixed.`);
    }
  }
  return out;
}

function existingIds(svc: Services, plan: Plan): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const log of plan.logs) {
    const lay = layoutFor(svc, plan, log);
    out[log.id] = new Set(lay.ok ? svc.readRows(log.name).map((r) => r[lay.map[0]!] ?? "").filter(Boolean) : []);
  }
  return out;
}

// ---------- sending ----------

export type SendKind = "reminder" | "alert";

function readCount(svc: Services, date: string): number {
  try {
    const v = JSON.parse(svc.getProp(COUNT_PROP) ?? "null") as { date?: string; count?: number } | null;
    return v && v.date === date && typeof v.count === "number" ? v.count : 0;
  } catch {
    return 0;
  }
}

function readKeyed(svc: Services, prop: string, key: string): number {
  try {
    const v = JSON.parse(svc.getProp(prop) ?? "null") as { key?: string; count?: number } | null;
    return v && v.key === key && typeof v.count === "number" ? v.count : 0;
  } catch {
    return 0;
  }
}

const writeKeyed = (svc: Services, prop: string, key: string, count: number) => svc.setProp(prop, JSON.stringify({ key, count: Math.max(0, count) }));

function loadSentKeys(svc: Services, date: string): Set<string> {
  try {
    return new Set(JSON.parse(svc.getProp(SENT_PREFIX + date) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function groupByDate(keys: string[]): Map<string, string[]> {
  const byDate = new Map<string, string[]>();
  for (const k of keys) {
    const d = k.split("|")[1] ?? "";
    byDate.set(d, [...(byDate.get(d) ?? []), k]);
  }
  return byDate;
}

function recordKeys(svc: Services, keys: string[]): void {
  for (const [d, ks] of groupByDate(keys)) svc.setProp(SENT_PREFIX + d, JSON.stringify([...new Set([...loadSentKeys(svc, d), ...ks])]));
}

function forgetKeys(svc: Services, keys: string[]): void {
  for (const [d, ks] of groupByDate(keys)) {
    const left = [...loadSentKeys(svc, d)].filter((k) => !ks.includes(k));
    if (left.length) svc.setProp(SENT_PREFIX + d, JSON.stringify(left));
    else svc.deleteProp(SENT_PREFIX + d);
  }
}

function pruneSentKeys(svc: Services, today: string): void {
  const oldest = addDays(today, -2);
  for (const k of svc.listPropKeys()) if (k.startsWith(SENT_PREFIX) && k.slice(SENT_PREFIX.length) < oldest) svc.deleteProp(k);
}

interface Batch {
  date: string;
  hourKey: string;
  kind: SendKind;
  take: Outgoing[];
}

/**
 * Decide what may go out and RESERVE it. The caller holds the script lock. The daily count and the sent keys are
 * written before any mail is sent, so a second run that starts during the send sees them and cannot send the same
 * thing or overspend the day's emails. dispatch() gives back whatever did not actually go out.
 */
function reserve(svc: Services, plan: Plan, items: Outgoing[], kind: SendKind): Batch {
  const z = zonedParts(svc.now(), plan.time_zone);
  const batch: Batch = { date: z.date, hourKey: `${z.date}T${z.hour}`, kind, take: [] };
  if (items.length === 0) return batch;
  const claimed = loadSentKeys(svc, z.date);
  const fresh = items.filter((i) => i.keys.length === 0 || i.keys.some((k) => !claimed.has(k)));
  const used = readCount(svc, z.date);
  // MailApp's own remaining quota is the ceiling, whatever the account type says.
  const cap = Math.max(0, Math.min(dailyCapFor(plan.owner.email), svc.remainingQuota() + used));
  const sp = planSends(fresh.map((i) => i.to), used, cap);
  let allowedList = sp.allowed;
  if (kind === "alert") {
    const dayRoom = Math.max(0, Math.floor(cap / 2) - readKeyed(svc, ALERT_DAY_PROP, z.date));
    const hourRoom = Math.max(0, ALERTS_PER_HOUR - readKeyed(svc, ALERT_HOUR_PROP, batch.hourKey));
    const room = Math.min(dayRoom, hourRoom);
    if (allowedList.length > room) {
      const dropped = allowedList.length - room;
      allowedList = allowedList.slice(0, room);
      if (svc.getProp(ALERT_NOTICE_PROP) !== z.date) {
        svc.setProp(ALERT_NOTICE_PROP, z.date);
        logActivity(svc, "warning", `${dropped} alert email(s) were not sent. Alerts are limited to ${ALERTS_PER_HOUR} per hour and half of the day's emails, so reminders and digests always have room. The entries themselves were saved.`);
      }
    }
  }
  const allowed = new Set(allowedList);
  for (const it of fresh) {
    const to = it.to.trim().toLowerCase();
    if (!allowed.has(to)) continue;
    allowed.delete(to);
    batch.take.push(it);
  }
  if (batch.take.length) {
    svc.setProp(COUNT_PROP, JSON.stringify({ date: z.date, count: used + batch.take.length }));
    recordKeys(svc, batch.take.flatMap((i) => i.keys));
    if (kind === "alert") {
      writeKeyed(svc, ALERT_DAY_PROP, z.date, readKeyed(svc, ALERT_DAY_PROP, z.date) + batch.take.length);
      writeKeyed(svc, ALERT_HOUR_PROP, batch.hourKey, readKeyed(svc, ALERT_HOUR_PROP, batch.hourKey) + batch.take.length);
    }
  }
  const msg = sp.deferred.length ? sp.message : planSends(allowedList, used, cap).message;
  if (msg) {
    const noticeKind = sp.deferred.length ? "limit" : "warn";
    if (svc.getProp(NOTICE_PROP) !== `${z.date}|${noticeKind}`) {
      svc.setProp(NOTICE_PROP, `${z.date}|${noticeKind}`);
      logActivity(svc, "warning", msg);
    }
  }
  return batch;
}

/** Send a reserved batch with NO lock held, then give back the reservation for anything that failed. Returns how many went out. */
function dispatch(svc: Services, batch: Batch): number {
  let sent = 0;
  let failed = 0;
  const failedKeys: string[] = [];
  for (const it of batch.take) {
    const to = it.to.trim().toLowerCase();
    try {
      svc.sendMail(to, it.subject, it.body);
      sent++;
    } catch (e) {
      failed++;
      failedKeys.push(...it.keys);
      logActivity(svc, "error", `An email to ${to} could not be sent: ${errText(e)}`);
    }
  }
  if (failed) {
    try {
      locked(svc, () => {
        svc.setProp(COUNT_PROP, JSON.stringify({ date: batch.date, count: Math.max(0, readCount(svc, batch.date) - failed) }));
        forgetKeys(svc, failedKeys);
        if (batch.kind === "alert") {
          writeKeyed(svc, ALERT_DAY_PROP, batch.date, readKeyed(svc, ALERT_DAY_PROP, batch.date) - failed);
          writeKeyed(svc, ALERT_HOUR_PROP, batch.hourKey, readKeyed(svc, ALERT_HOUR_PROP, batch.hourKey) - failed);
        }
      });
    } catch (e) {
      // Safe direction: the count stays high and the keys stay recorded, so nothing is sent twice.
      logActivity(svc, "warning", `The sheet was busy, so ${failed} failed email(s) were not given back to today's count: ${errText(e)}`);
    }
  }
  return sent;
}

/** Send under the daily cap: reserve under the lock, send without it. Only emails that really went out stay counted. */
export function deliver(svc: Services, plan: Plan, items: Outgoing[], kind: SendKind = "reminder"): number {
  if (items.length === 0) return 0;
  return dispatch(svc, locked(svc, () => reserve(svc, plan, items, kind)));
}

// ---------- adding entries ----------

export interface NewEntry {
  logId: string;
  raw: Record<string, unknown>;
  /** Verified email (Google confirmed it), or "". Only this can identify the owner. */
  submitterEmail: string;
  submitterName: string;
  /** An email the form reported but Google did not verify. Recorded, never trusted. */
  unverifiedEmail?: string;
  /** Stable per submission (form response id) or random (sidebar). */
  seed: string;
  submittedAt: string;
}

export type AddResult = { ok: true; message: string; duplicate: boolean } | { ok: false; errors: string[] };

export function addEntry(svc: Services, plan: Plan, ne: NewEntry): AddResult {
  const log = baseLogs(plan).find((l) => l.id === ne.logId);
  if (!log) return { ok: false, errors: ["That log does not accept new entries."] };
  const norm = normaliseEntry(plan, log.id, ne.raw);
  if (!norm.ok) return { ok: false, errors: norm.errors };

  const enteredBy = ne.submitterEmail || (ne.unverifiedEmail ? `${ne.unverifiedEmail} (unverified)` : "") || ne.submitterName || "unknown";
  const entry: Entry = {
    id: makeEntryId({ seed: ne.seed, logId: log.id, submittedAt: ne.submittedAt }),
    values: norm.values,
    enteredBy,
    enteredAt: ne.submittedAt,
  };

  let duplicate = false;
  let refused = "";
  const routed: string[] = [];
  const skipped: string[] = [];
  locked(svc, () => {
    const lay = layoutFor(svc, plan, log);
    if (!lay.ok) {
      refused = lay.message;
      return;
    }
    const existing = existingIds(svc, plan);
    if (existing[log.id]?.has(entry.id)) {
      duplicate = true;
      return;
    }
    svc.appendRows(log.name, [alignRow(protectedCells(plan, log.id, entry), lay)]);
    const rp = planRouting(plan, log.id, entry, existing);
    for (const row of rp.rows) {
      const target = plan.logs.find((l) => l.id === row.logId);
      if (!target) continue;
      const tl = layoutFor(svc, plan, target);
      if (!tl.ok) {
        skipped.push(tl.message);
        continue;
      }
      svc.appendRows(target.name, [alignRow(protectedCells(plan, row.logId, entry), tl)]);
      routed.push(target.name);
    }
  });
  if (refused) {
    logActivity(svc, "error", `An entry was not added. ${refused}`);
    return { ok: false, errors: [refused] };
  }
  if (duplicate) return { ok: true, duplicate: true, message: "That entry was already recorded." };
  for (const m of skipped) logActivity(svc, "warning", `A copy was not written. ${m}`);

  const decision = alertsForSubmission(plan, ne.submitterEmail);
  const who = decision.submitter.name ?? enteredBy;
  logActivity(svc, "info", `New entry added to "${log.name}" by ${who}${routed.length ? `, copied to ${routed.join(", ")}` : ""}.`);
  if (decision.notify.length) {
    deliver(svc, plan, decision.notify.map((to) => alertEmail(plan, to, log.id, log.name, entry, who)), "alert");
  }
  return { ok: true, duplicate: false, message: `Saved to "${log.name}"${routed.length ? ` and copied to ${routed.join(", ")}` : ""}.` };
}

function importSubmission(svc: Services, plan: Plan, sub: FormSubmission, quiet = false): AddResult {
  const bases = baseLogs(plan);
  const log = bases.find((b) => svc.getProp(formProp(b.id)) === sub.formId) ?? (bases.length === 1 ? bases[0] : undefined);
  if (!log) {
    logActivity(svc, "error", "A form answer arrived from a form this sheet does not recognise. Run Activate again.");
    return { ok: false, errors: ["Unknown form."] };
  }
  const byTitle = new Map(Object.entries(sub.answers).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const raw: Record<string, unknown> = {};
  for (const f of logFields(plan, log.id)) raw[f.key] = byTitle.get(f.label.trim().toLowerCase());
  const nameAnswer = byTitle.get(nameQuestionTitle(plan, log.id).toLowerCase());
  // Only an email Google verified may identify anyone (above all, the owner).
  const verified = svc.getProp(verifiedProp(sub.formId)) === "1";
  const email = cleanName(sub.email);
  const r = addEntry(svc, plan, {
    logId: log.id,
    raw,
    submitterEmail: verified ? sub.email : "",
    unverifiedEmail: verified ? "" : email,
    submitterName: cleanName(typeof nameAnswer === "string" ? nameAnswer : ""),
    seed: sub.responseId,
    submittedAt: sub.timestamp,
  });
  if (!r.ok && !quiet) {
    logActivity(svc, "error", `A form answer was not added to "${log.name}" (it is still in the form's responses): ${r.errors.join("; ")}`);
  }
  return r;
}

export function handleFormSubmission(svc: Services, sub: FormSubmission): AddResult {
  const loaded = loadPlan(svc);
  if (!loaded.ok) {
    logActivity(svc, "error", `A form answer could not be added. ${loaded.message}`);
    return { ok: false, errors: [loaded.message] };
  }
  return importSubmission(svc, loaded.plan, sub);
}

/** Re-import form responses that never reached the log (for example the trigger timed out). Safe to repeat: ids are deterministic. */
function catchUp(svc: Services, plan: Plan): void {
  const from = svc.getProp(IMPORT_FROM_PROP);
  if (!from) return;
  const weekAgo = new Date(svc.now().getTime() - 7 * 24 * 3600_000).toISOString();
  const since = from > weekAgo ? from : weekAgo;
  for (const log of baseLogs(plan)) {
    const formId = svc.getProp(formProp(log.id));
    if (!formId) continue;
    const known = existingIds(svc, plan)[log.id] ?? new Set<string>();
    for (const sub of svc.listFormResponses(formId, since)) {
      if (known.has(makeEntryId({ seed: sub.responseId, logId: log.id, submittedAt: sub.timestamp }))) continue;
      const r = importSubmission(svc, plan, sub, true);
      if (r.ok && !r.duplicate) logActivity(svc, "info", `Imported a form answer that the form trigger had missed, into "${log.name}".`);
    }
  }
}

export function submitEntryFromSidebar(svc: Services, payload: unknown): AddResult {
  const p = payload as { logId?: unknown; values?: unknown } | null;
  if (!p || typeof p.logId !== "string" || !p.values || typeof p.values !== "object" || Array.isArray(p.values)) {
    return { ok: false, errors: ["The form data was not understood. Please close the sidebar and try again."] };
  }
  const loaded = loadPlan(svc);
  if (!loaded.ok) return { ok: false, errors: [loaded.message] };
  const plan = loaded.plan;
  // A blank email is recorded as unknown (never assumed to be the owner), so alerts still go out.
  return addEntry(svc, plan, {
    logId: p.logId,
    raw: p.values as Record<string, unknown>,
    submitterEmail: svc.activeUserEmail(),
    submitterName: "",
    seed: svc.newId(),
    submittedAt: svc.now().toISOString(),
  });
}

// ---------- routing, reminders ----------

export function runRoutingNow(svc: Services): string {
  const loaded = loadPlan(svc);
  if (!loaded.ok) {
    logActivity(svc, "error", `Routing stopped. ${loaded.message}`);
    return loaded.message;
  }
  const plan = loaded.plan;
  let copied = 0;
  let skipped = 0;
  const problems: string[] = [];
  locked(svc, () => {
    const existing = existingIds(svc, plan);
    for (const log of baseLogs(plan)) {
      if (!plan.routing_rules.some((r) => r.from === log.id)) continue;
      const src = readLog(svc, plan, log);
      if (!src.ok) {
        problems.push(src.message);
        continue;
      }
      for (const row of src.rows) {
        const entry = rowToEntry(plan, log.id, row, src.headers);
        if (!entry.id) {
          skipped++;
          continue;
        }
        const rp = planRouting(plan, log.id, entry, existing);
        for (const out of rp.rows) {
          const target = plan.logs.find((l) => l.id === out.logId);
          if (!target) continue;
          const tl = layoutFor(svc, plan, target);
          if (!tl.ok) {
            if (!problems.includes(tl.message)) problems.push(tl.message);
            continue;
          }
          svc.appendRows(target.name, [alignRow(protectedCells(plan, out.logId, entry), tl)]);
          existing[out.logId]?.add(out.entryId);
          copied++;
        }
      }
    }
  });
  for (const p of problems) logActivity(svc, "warning", p);
  const msg = `Routing finished. ${copied} row(s) copied.${skipped ? ` ${skipped} row(s) without an Entry ID were skipped.` : ""}${problems.length ? ` ${problems.length} problem(s) with tab headings. See Activity.` : ""}`;
  logActivity(svc, skipped || problems.length ? "warning" : "info", msg);
  return msg;
}

export function hourlyTick(svc: Services): number {
  const loaded = loadPlan(svc);
  if (!loaded.ok) {
    logActivity(svc, "error", `The hourly check stopped. ${loaded.message}`);
    return 0;
  }
  const plan = loaded.plan;
  try {
    catchUp(svc, plan);
  } catch (e) {
    logActivity(svc, "warning", `Checking the form for missed answers did not finish: ${errText(e)}`);
  }
  // Work out what to send, and reserve it, under the lock. Then release the lock before any mail goes out.
  const batch = locked(svc, () => {
    const now = svc.now();
    const date = zonedParts(now, plan.time_zone).date;
    pruneSentKeys(svc, date);
    const sentKeys = loadSentKeys(svc, date);
    const rows = loadRows(svc, plan, date);
    const reminders = dueReminders(plan, rows, now, { sentKeys });
    const digests = digestsToSend(plan, rows, now, sentKeys);
    return reserve(svc, plan, buildOutgoing(plan, reminders, digests, date), "reminder");
  });
  return dispatch(svc, batch);
}

export function sendTestReminder(svc: Services): string {
  const loaded = loadPlan(svc);
  if (!loaded.ok) {
    logActivity(svc, "error", `The test reminder was not sent. ${loaded.message}`);
    return loaded.message;
  }
  const plan = loaded.plan;
  const now = svc.now();
  const date = zonedParts(now, plan.time_zone).date;
  const rows = loadRows(svc, plan, date);
  const reminders = dueReminders(plan, rows, now, { ignoreSendHour: true });
  const sent = deliver(svc, plan, [testEmail(plan, plan.owner.email.toLowerCase(), reminders, buildDigest(plan, rows, now), date)]);
  const msg = sent ? `A test email was sent to ${plan.owner.email}.` : "The test email was not sent. See the Activity tab.";
  logActivity(svc, sent ? "info" : "warning", msg);
  return msg;
}

// ---------- menu, sidebar, help ----------

export const MENU_ITEMS = [
  { label: "Add entry", handler: "showAddEntrySidebar" },
  { label: "Run routing now", handler: "runRoutingNow" },
  { label: "Send test reminder", handler: "sendTestReminder" },
  "separator",
  { label: "Replace plan", handler: "showPastePlanDialog" },
  { label: "Activate", handler: "activate" },
  { label: "Help", handler: "showHelp" },
] as const;

/** Menu for a sheet with no valid plan yet. */
export const PASTE_ONLY_MENU = [
  { label: "Paste your plan", handler: "showPastePlanDialog" },
  { label: "Help", handler: "showHelp" },
] as const;

export function buildMenu(svc: Services): void {
  const loaded = loadPlan(svc);
  if (loaded.ok) svc.setMenu(loaded.plan.system_name, [...MENU_ITEMS]);
  else svc.setMenu("LogWizard", [...PASTE_ONLY_MENU]);
}

// ---------- paste your plan ----------

/** Pretty printed plans carry extra spaces, so the pasted text may be larger than the plan itself. */
const MAX_PASTE_CHARS = MAX_PLAN_BYTES * 3;
/** A cell holds 50,000 characters. Stay under it. */
const PLAN_CHUNK = 40000;

export interface PasteResult {
  ok: boolean;
  message: string;
  errors?: string[];
}

const pasteFail = (message: string, errors?: string[]): PasteResult => (errors ? { ok: false, message, errors } : { ok: false, message });

/**
 * Check a plan the owner pasted and, only if it is valid, store it in the hidden _plan tab.
 * Accepts the bare plan, the planner reply ({plan, ...}) or the downloaded file (a bare plan). Never throws on bad input.
 */
export function savePlanFromPaste(svc: Services, text: string): PasteResult {
  if (typeof text === "string" && text.length > MAX_PASTE_CHARS) return pasteFail("That text is too large to be a plan. Copy the plan again from the LogWizard page.");
  if (typeof text !== "string" || !text.trim()) return pasteFail("Nothing was pasted. Copy your plan from the LogWizard page, then paste it here.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return pasteFail("That does not look like a plan. Go back to the LogWizard page, use Copy your plan, and paste everything.");
  }
  if (data && typeof data === "object" && !Array.isArray(data) && "plan" in data) {
    const inner = (data as { plan: unknown }).plan;
    if (!inner || typeof inner !== "object") return pasteFail("That reply has no plan in it. Use the approved plan from the LogWizard page.");
    data = inner;
  }
  const r = validatePlan(data);
  if (!r.ok) {
    const errors = r.errors.slice(0, 5).map((e) => e.message);
    return pasteFail("The plan has problems, so nothing was saved.", errors);
  }
  const plan = r.plan;
  const user = svc.activeUserEmail().trim();
  if (user) plan.owner.email = user;
  const json = JSON.stringify(plan);
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += PLAN_CHUNK) chunks.push(json.slice(i, i + PLAN_CHUNK));
  svc.withLock(() => svc.writePlanChunks(chunks));
  logActivity(svc, "info", `Plan saved for "${plan.system_name}" from the Paste your plan dialog.`);
  const who = user ? ` Reminders and alerts will go to ${user}, because you own this sheet.` : "";
  return { ok: true, message: `Plan saved.${who} Now reload the sheet, then use the ${plan.system_name} menu > Activate.` };
}

const PASTE_DIALOG_HTML = `<!DOCTYPE html><html><head><base target="_top"><style>
body{font-family:Arial,sans-serif;font-size:13px;margin:12px}
textarea{width:100%;box-sizing:border-box;height:260px;font-family:monospace;font-size:12px}
button{padding:6px 14px;margin-top:8px}#msg{margin-top:10px;white-space:pre-wrap}.err{color:#b00020}.ok{color:#146c2e}
</style></head><body>
<p><label for="plan">On the LogWizard page, use "Copy your plan". Then paste it here and press Save.</label></p>
<textarea id="plan" spellcheck="false"></textarea>
<button id="save">Save</button><div id="msg" role="status" aria-live="polite"></div>
<script>
(function(){
  function show(t,c){var m=document.getElementById('msg');m.className=c;m.textContent=t;}
  document.getElementById('save').onclick=function(){
    var btn=this;btn.disabled=true;show('Checking...','');
    google.script.run.withSuccessHandler(function(r){btn.disabled=false;
      if(r&&r.ok){show(r.message,'ok');}else{show([(r&&r.message)||'Something went wrong.'].concat((r&&r.errors)||[]).join('\\n'),'err');}
    }).withFailureHandler(function(e){btn.disabled=false;show('Could not save: '+(e&&e.message?e.message:e),'err');})
    .savePlanFromDialog(document.getElementById('plan').value);
  };
})();
</script></body></html>`;

export function showPasteDialog(svc: Services): void {
  svc.showDialog("Paste your plan", PASTE_DIALOG_HTML);
}

export function showSidebar(svc: Services): void {
  const loaded = loadPlan(svc);
  if (!loaded.ok) return svc.alert("Add entry", loaded.message);
  svc.showSidebar("Add entry", buildSidebarHtml(loaded.plan));
}

export const HELP_TEXT = [
  "Add entry: opens a form in the side panel for you (the owner).",
  "Contributors add entries with the Google Form linked on the Setup tab.",
  "Run routing now: copies entries to the other logs that match the rules. It never makes duplicates.",
  "Send test reminder: emails you what is due today, ignoring the send hour.",
  "Paste your plan or Replace plan: opens a box where you paste the plan you copied from the LogWizard page.",
  "Activate: run once after the plan is in place. It builds the tabs and form and sets up the hourly check.",
  "Problems are written in plain language on the Activity tab.",
].join("\n\n");

/** Wrap an entry point: any failure becomes a plain message on Activity (and on screen when ui is true). */
export function guarded<T>(svc: Services, what: string, fn: () => T, ui = true): T | undefined {
  try {
    return fn();
  } catch (e) {
    const msg = isBusy(e)
      ? ui
        ? "The sheet is busy with another change. Please try again in a minute."
        : `${what} was skipped because the sheet was busy. ${what === "Form submit" ? "The answer is still in the form's responses and the next hourly check will add it." : "It will run again at the next hourly check."}`
      : `${what} did not finish: ${errText(e)}`;
    logActivity(svc, "error", msg);
    if (ui) {
      try {
        svc.alert(what, msg);
      } catch {
        // No UI available (running from a trigger).
      }
    }
    return undefined;
  }
}
