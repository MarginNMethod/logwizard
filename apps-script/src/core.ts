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
  entryToCells,
  headersForLog,
  logFields,
  makeEntryId,
  normaliseEntry,
  planRouting,
  planSends,
  sanitizeCellValue,
  zonedParts,
} from "@logwizard/engine-logic";
import type { Entry, EntryValue, Plan, PlanField, PlanLog, RowsByLog } from "@logwizard/engine-logic";
import { validatePlan } from "@logwizard/plan-schema";
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

const SENT_PREFIX = "sent:";
const COUNT_PROP = "sendCount";
const NOTICE_PROP = "capNotice";
const formProp = (logId: string) => `formId:${logId}`;

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
    { title: NAME_QUESTION, kind: "text", required: true, help: "Used to record who entered this. Please use your own name." },
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

  for (const log of plan.logs) {
    const r = svc.ensureLogTab({ name: log.name, headers: headersForLog(plan, log.id), rules: rulesFor(plan, log.id) });
    if (r.headerMismatch) {
      logActivity(svc, "warning", `The tab "${log.name}" already has different column headings, so it was left as it is. Your data was not changed.`);
    }
  }

  const forms: { log: PlanLog; url: string }[] = [];
  const formIds: string[] = [];
  for (const log of baseLogs(plan)) {
    const info = svc.ensureForm(formSpec(plan, log), svc.getProp(formProp(log.id)));
    svc.setProp(formProp(log.id), info.id);
    forms.push({ log, url: info.url });
    formIds.push(info.id);
    if (info.addedItems.length) logActivity(svc, "info", `Added new questions to the form for "${log.name}": ${info.addedItems.join(", ")}.`);
  }

  // Remove only this engine's own old triggers, then install the inventory.
  const own = new Set<string>(TRIGGER_INVENTORY.map((t) => t.handler));
  for (const t of svc.listTriggers()) if (own.has(t.handler)) svc.deleteTrigger(t.id);
  let installed = 0;
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

  const activatedAt = svc.now().toISOString();
  svc.setProp("activatedAt", activatedAt);
  const rows: string[][] = [
    ["Setting", "Value"],
    ["System", plan.system_name],
    ["Activated at", activatedAt],
    ["Owner", plan.owner.email],
    ["Time zone", plan.time_zone],
    ["Triggers installed", `${installed} (hourly check, form submit)`],
    ["Daily email limit", String(dailyCapFor(plan.owner.email))],
    ...forms.map((f) => [`Form for "${f.log.name}"`, f.url]),
    ["Note", "Contributors use the form links above. They do not need to approve anything."],
  ];
  svc.replaceSetup(rows.map((r) => r.map((c) => sanitizeCellValue(c))));
  logActivity(svc, "info", `Activated. ${installed} trigger(s) installed and ${forms.length} form(s) ready.`);
  return { ok: true, message: `Activated. See the Setup tab for the form link${forms.length === 1 ? "" : "s"}.` };
}

// ---------- reading rows ----------

const unescapeCell = (s: string): string => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

function parseValue(f: PlanField, raw: string): EntryValue {
  const s = unescapeCell(raw);
  if (f.type === "multi_choice") return s.split(",").map((x) => x.trim()).filter(Boolean);
  if (f.type === "number" && s !== "" && Number.isFinite(Number(s))) return Number(s);
  return s;
}

export function rowToEntry(plan: Plan, logId: string, row: string[]): Entry {
  const values: Record<string, EntryValue> = {};
  logFields(plan, logId).forEach((f, i) => {
    values[f.key] = parseValue(f, row[META_HEADERS.length + i] ?? "");
  });
  const entry: Entry = { id: unescapeCell(row[0] ?? ""), enteredBy: unescapeCell(row[1] ?? ""), values };
  const at = unescapeCell(row[2] ?? "");
  if (at) entry.enteredAt = at;
  return entry;
}

function loadRows(svc: Services, plan: Plan): RowsByLog {
  const out: Record<string, Entry[]> = {};
  for (const log of plan.logs) {
    out[log.id] = svc.readRows(log.name).filter((r) => (r[0] ?? "") !== "").map((r) => rowToEntry(plan, log.id, r));
  }
  return out;
}

function existingIds(svc: Services, plan: Plan): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const log of plan.logs) out[log.id] = new Set(svc.readRows(log.name).map((r) => unescapeCell(r[0] ?? "")).filter(Boolean));
  return out;
}

// ---------- sending ----------

function readCount(svc: Services, date: string): number {
  try {
    const v = JSON.parse(svc.getProp(COUNT_PROP) ?? "null") as { date?: string; count?: number } | null;
    return v && v.date === date && typeof v.count === "number" ? v.count : 0;
  } catch {
    return 0;
  }
}

function loadSentKeys(svc: Services, date: string): Set<string> {
  try {
    return new Set(JSON.parse(svc.getProp(SENT_PREFIX + date) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function recordKeys(svc: Services, keys: string[]): void {
  const byDate = new Map<string, string[]>();
  for (const k of keys) {
    const d = k.split("|")[1] ?? "";
    byDate.set(d, [...(byDate.get(d) ?? []), k]);
  }
  for (const [d, ks] of byDate) svc.setProp(SENT_PREFIX + d, JSON.stringify([...new Set([...loadSentKeys(svc, d), ...ks])]));
}

function pruneSentKeys(svc: Services, today: string): void {
  const oldest = addDays(today, -2);
  for (const k of svc.listPropKeys()) if (k.startsWith(SENT_PREFIX) && k.slice(SENT_PREFIX.length) < oldest) svc.deleteProp(k);
}

/** Send under the daily cap. Only emails that really went out count and record their keys. Returns how many were sent. */
export function deliver(svc: Services, plan: Plan, items: Outgoing[]): number {
  if (items.length === 0) return 0;
  const today = zonedParts(svc.now(), plan.time_zone).date;
  const cap = dailyCapFor(plan.owner.email);
  const used = readCount(svc, today);
  const sp = planSends(items.map((i) => i.to), used, cap);
  const allowed = new Set(sp.allowed);
  let sent = 0;
  const keys: string[] = [];
  for (const it of items) {
    const to = it.to.trim().toLowerCase();
    if (!allowed.has(to)) continue;
    allowed.delete(to);
    try {
      svc.sendMail(to, it.subject, it.body);
      sent++;
      keys.push(...it.keys);
    } catch (e) {
      logActivity(svc, "error", `An email to ${to} could not be sent: ${errText(e)}`);
    }
  }
  if (keys.length) recordKeys(svc, keys);
  if (sent) svc.setProp(COUNT_PROP, JSON.stringify({ date: today, count: used + sent }));
  if (sp.message) {
    const kind = sp.deferred.length ? "limit" : "warn";
    if (svc.getProp(NOTICE_PROP) !== `${today}|${kind}`) {
      svc.setProp(NOTICE_PROP, `${today}|${kind}`);
      logActivity(svc, "warning", sp.message);
    }
  }
  return sent;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------- adding entries ----------

export interface NewEntry {
  logId: string;
  raw: Record<string, unknown>;
  submitterEmail: string;
  submitterName: string;
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

  const entry: Entry = {
    id: makeEntryId({ seed: ne.seed, logId: log.id, submittedAt: ne.submittedAt }),
    values: norm.values,
    enteredBy: ne.submitterEmail || ne.submitterName || "unknown",
    enteredAt: ne.submittedAt,
  };

  let duplicate = false;
  const routed: string[] = [];
  svc.withLock(() => {
    const existing = existingIds(svc, plan);
    if (existing[log.id]?.has(entry.id)) {
      duplicate = true;
      return;
    }
    svc.appendRows(log.name, [entryToCells(plan, log.id, entry)]);
    const rp = planRouting(plan, log.id, entry, existing);
    for (const row of rp.rows) {
      const target = plan.logs.find((l) => l.id === row.logId);
      if (!target) continue;
      svc.appendRows(target.name, [row.cells]);
      routed.push(target.name);
    }
  });
  if (duplicate) return { ok: true, duplicate: true, message: "That entry was already recorded." };

  const decision = alertsForSubmission(plan, ne.submitterEmail);
  const who = decision.submitter.name ?? (ne.submitterEmail || ne.submitterName || "Someone");
  logActivity(svc, "info", `New entry added to "${log.name}" by ${who}${routed.length ? `, copied to ${routed.join(", ")}` : ""}.`);
  if (decision.notify.length) {
    deliver(svc, plan, decision.notify.map((to) => alertEmail(plan, to, log.id, log.name, entry, who)));
  }
  return { ok: true, duplicate: false, message: `Saved to "${log.name}"${routed.length ? ` and copied to ${routed.join(", ")}` : ""}.` };
}

export function handleFormSubmission(svc: Services, sub: FormSubmission): AddResult {
  const loaded = loadPlan(svc);
  if (!loaded.ok) {
    logActivity(svc, "error", `A form answer could not be added. ${loaded.message}`);
    return { ok: false, errors: [loaded.message] };
  }
  const plan = loaded.plan;
  const bases = baseLogs(plan);
  const log = bases.find((b) => svc.getProp(formProp(b.id)) === sub.formId) ?? (bases.length === 1 ? bases[0] : undefined);
  if (!log) {
    logActivity(svc, "error", "A form answer arrived from a form this sheet does not recognise. Run Activate again.");
    return { ok: false, errors: ["Unknown form."] };
  }
  const byTitle = new Map(Object.entries(sub.answers).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const raw: Record<string, unknown> = {};
  for (const f of logFields(plan, log.id)) raw[f.key] = byTitle.get(f.label.trim().toLowerCase());
  const nameAnswer = byTitle.get(NAME_QUESTION.toLowerCase());
  const r = addEntry(svc, plan, {
    logId: log.id,
    raw,
    submitterEmail: sub.email,
    submitterName: typeof nameAnswer === "string" ? nameAnswer.trim() : "",
    seed: sub.responseId,
    submittedAt: sub.timestamp,
  });
  if (!r.ok) {
    logActivity(svc, "error", `A form answer was not added to "${log.name}" (it is still in the form's responses): ${r.errors.join("; ")}`);
  }
  return r;
}

export function submitEntryFromSidebar(svc: Services, payload: unknown): AddResult {
  const p = payload as { logId?: unknown; values?: unknown } | null;
  if (!p || typeof p.logId !== "string" || !p.values || typeof p.values !== "object" || Array.isArray(p.values)) {
    return { ok: false, errors: ["The form data was not understood. Please close the sidebar and try again."] };
  }
  const loaded = loadPlan(svc);
  if (!loaded.ok) return { ok: false, errors: [loaded.message] };
  const plan = loaded.plan;
  return addEntry(svc, plan, {
    logId: p.logId,
    raw: p.values as Record<string, unknown>,
    submitterEmail: svc.activeUserEmail() || plan.owner.email,
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
  svc.withLock(() => {
    const existing = existingIds(svc, plan);
    for (const log of baseLogs(plan)) {
      if (!plan.routing_rules.some((r) => r.from === log.id)) continue;
      for (const row of svc.readRows(log.name)) {
        if (!unescapeCell(row[0] ?? "")) {
          skipped++;
          continue;
        }
        const rp = planRouting(plan, log.id, rowToEntry(plan, log.id, row), existing);
        for (const out of rp.rows) {
          const target = plan.logs.find((l) => l.id === out.logId);
          if (!target) continue;
          svc.appendRows(target.name, [out.cells]);
          existing[out.logId]?.add(out.entryId);
          copied++;
        }
      }
    }
  });
  const msg = `Routing finished. ${copied} row(s) copied.${skipped ? ` ${skipped} row(s) without an Entry ID were skipped.` : ""}`;
  logActivity(svc, skipped ? "warning" : "info", msg);
  return msg;
}

export function hourlyTick(svc: Services): number {
  const loaded = loadPlan(svc);
  if (!loaded.ok) {
    logActivity(svc, "error", `The hourly check stopped. ${loaded.message}`);
    return 0;
  }
  const plan = loaded.plan;
  return svc.withLock(() => {
    const now = svc.now();
    const date = zonedParts(now, plan.time_zone).date;
    pruneSentKeys(svc, date);
    const sentKeys = loadSentKeys(svc, date);
    const rows = loadRows(svc, plan);
    const reminders = dueReminders(plan, rows, now, { sentKeys });
    const digests = digestsToSend(plan, rows, now, sentKeys);
    return deliver(svc, plan, buildOutgoing(plan, reminders, digests, date));
  });
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
  const rows = loadRows(svc, plan);
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
  { label: "Activate", handler: "activate" },
  { label: "Help", handler: "showHelp" },
] as const;

export function buildMenu(svc: Services): void {
  const loaded = loadPlan(svc);
  svc.setMenu(loaded.ok ? loaded.plan.system_name : "LogWizard", [...MENU_ITEMS]);
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
  "Activate: run once after the plan is in place. It builds the tabs and form and sets up the hourly check.",
  "Problems are written in plain language on the Activity tab.",
].join("\n\n");

/** Wrap an entry point: any failure becomes a plain message on Activity (and on screen when ui is true). */
export function guarded<T>(svc: Services, what: string, fn: () => T, ui = true): T | undefined {
  try {
    return fn();
  } catch (e) {
    const busy = /lock/i.test(errText(e));
    const msg = busy ? "The sheet is busy with another change. Please try again in a minute." : `${what} did not finish: ${errText(e)}`;
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
