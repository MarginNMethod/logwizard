import { makePlan } from "../../packages/engine-logic/test/fixture.js";
import type { Plan } from "@logwizard/engine-logic";
import type { FormInfo, FormSpec, FormSubmission, LogTabSpec, MenuItem, Services, TriggerInfo } from "../src/services.js";

export { makePlan };

export interface Mail { to: string; subject: string; body: string }

/** In-memory Google. Mirrors the contract in services.ts: tabs hold rows, row 0 of a tab is its header. */
export class FakeServices implements Services {
  tabs = new Map<string, string[][]>();
  logTabSpecs = new Map<string, LogTabSpec>();
  props = new Map<string, string>();
  forms: { id: string; spec: FormSpec; url: string }[] = [];
  triggers: (TriggerInfo & { formId?: string })[] = [];
  /** Handlers belonging to someone else; Activate must never remove them. */
  mails: Mail[] = [];
  alerts: { title: string; message: string }[] = [];
  sidebars: { title: string; html: string }[] = [];
  dialogs: { title: string; html: string }[] = [];
  planTabHidden = false;
  menu: { name: string; items: (MenuItem | "separator")[] } | null = null;
  lockCalls = 0;
  /** True while the script lock is held. A second withLock while held fails like a real lock timeout. */
  locked = false;
  /** Number of upcoming withLock calls that fail with a lock timeout. */
  lockFailures = 0;
  /** Remaining MailApp quota. */
  quota = 10000;
  /** What ensureForm reports for verified email collection. */
  verifiedEmail = true;
  /** Form responses by form id, as a real form would hold them. */
  responses = new Map<string, FormSubmission[]>();
  /** Runs inside sendMail, to simulate other work happening while a send is in progress. */
  onSend: ((mail: Mail) => void) | null = null;
  tz = "";
  nowValue = new Date("2026-03-01T15:00:00Z"); // 09:00 in America/Chicago
  user = "";
  failMail = false;
  /** Every appendRows call, for asserting what was written. */
  writes: { tab: string; rows: string[][] }[] = [];
  /**
   * REAL Google behaviour (found at H2): setValues treats any string starting with "=" as a formula, EVEN in a
   * cell formatted "@". Every such write is recorded here. A safe engine leaves this empty.
   */
  formulaCells: { tab: string; row: number; col: number; value: string }[] = [];
  private seq = 0;
  private mark(tab: string, rows: string[][], firstRow: number) {
    rows.forEach((r, i) => r.forEach((v, j) => {
      if (typeof v === "string" && v.startsWith("=")) this.formulaCells.push({ tab, row: firstRow + i, col: j + 1, value: v });
    }));
  }

  constructor(plan?: Plan | string | null) {
    if (plan !== null) this.setPlan(plan ?? makePlan());
  }

  setPlan(plan: Plan | string): void {
    this.tabs.set("_plan", [[typeof plan === "string" ? plan : JSON.stringify(plan)]]);
  }

  now = () => this.nowValue;
  newId = () => `uuid-${++this.seq}`;
  activeUserEmail = () => this.user;

  readPlanText() {
    const t = this.tabs.get("_plan");
    return t ? t.map((r) => r[0] ?? "").join("") || null : null;
  }
  writePlanChunks(chunks: string[]) {
    this.tabs.set("_plan", chunks.map((c) => [c]));
    this.planTabHidden = true;
  }
  setSpreadsheetTimeZone(tz: string) { this.tz = tz; }
  ensureLogTab(spec: LogTabSpec) {
    const created = !this.tabs.has(spec.name);
    if (created) {
      this.tabs.set(spec.name, [spec.headers]);
      this.mark(spec.name, [spec.headers], 1);
    }
    this.logTabSpecs.set(spec.name, spec);
    const head = this.tabs.get(spec.name)![0]!;
    return { created, headerMismatch: head.join("|") !== spec.headers.join("|") };
  }
  ensureInfoTab(name: string, headers: string[]) {
    if (!this.tabs.has(name)) {
      this.tabs.set(name, [headers]);
      this.mark(name, [headers], 1);
    }
  }
  readHeaders(tab: string) {
    const t = this.tabs.get(tab);
    if (!t || !t[0]) return null;
    const h = [...t[0]];
    while (h.length && h[h.length - 1] === "") h.pop();
    return h.length ? h : null;
  }
  appendHeaders(tab: string, extra: string[]) {
    this.mark(tab, [extra], 1);
    this.tabs.get(tab)![0]!.push(...extra);
  }
  remainingQuota = () => this.quota;
  listFormResponses(formId: string, sinceIso: string): FormSubmission[] {
    return (this.responses.get(formId) ?? []).filter((r) => r.timestamp >= sinceIso);
  }
  readRows(tab: string) { return (this.tabs.get(tab) ?? []).slice(1).map((r) => [...r]); }
  appendRows(tab: string, rows: string[][]) {
    const t = this.tabs.get(tab);
    if (!t) throw new Error(`no tab ${tab}`);
    this.writes.push({ tab, rows });
    this.mark(tab, rows, t.length + 1);
    for (const r of rows) t.push([...r]);
  }
  replaceSetup(rows: string[][]) {
    this.mark("Setup", rows, 1);
    this.tabs.set("Setup", rows);
  }
  withLock<T>(fn: () => T): T {
    this.lockCalls++;
    if (this.locked || this.lockFailures > 0) {
      if (this.lockFailures > 0) this.lockFailures--;
      throw new Error("Lock timeout: another process was holding the lock for too long.");
    }
    this.locked = true;
    try {
      return fn();
    } finally {
      this.locked = false;
    }
  }

  getProp = (k: string) => this.props.get(k) ?? null;
  setProp = (k: string, v: string) => void this.props.set(k, v);
  deleteProp = (k: string) => void this.props.delete(k);
  listPropKeys = () => [...this.props.keys()];

  ensureForm(spec: FormSpec, existingId: string | null): FormInfo {
    const found = existingId ? this.forms.find((f) => f.id === existingId) : undefined;
    if (found) {
      const old = new Map(found.spec.items.map((i) => [i.title, i]));
      const addedItems = spec.items.filter((i) => !old.has(i.title)).map((i) => i.title);
      const updatedItems = spec.items
        .filter((i) => old.has(i.title) && (old.get(i.title)!.required !== i.required || (old.get(i.title)!.options ?? []).join("|") !== (i.options ?? []).join("|")))
        .map((i) => i.title);
      found.spec = spec;
      return { id: found.id, url: found.url, created: false, addedItems, updatedItems, verifiedEmail: this.verifiedEmail };
    }
    const id = `form-${this.forms.length + 1}`;
    const f = { id, spec, url: `https://forms.example.com/${id}` };
    this.forms.push(f);
    return { id, url: f.url, created: true, addedItems: [], updatedItems: [], verifiedEmail: this.verifiedEmail };
  }

  listTriggers = () => this.triggers.map(({ id, handler, kind }) => ({ id, handler, kind }));
  deleteTrigger(id: string) { this.triggers = this.triggers.filter((t) => t.id !== id); }
  createHourlyTrigger(handler: string) { this.triggers.push({ id: `t${++this.seq}`, handler, kind: "time" }); }
  createFormSubmitTrigger(formId: string, handler: string) { this.triggers.push({ id: `t${++this.seq}`, handler, kind: "form", formId }); }

  sendMail(to: string, subject: string, body: string) {
    if (this.failMail) throw new Error("mail down");
    const mail = { to, subject, body };
    this.mails.push(mail);
    const hook = this.onSend;
    if (hook) {
      this.onSend = null; // run once
      hook(mail);
    }
  }
  showSidebar(title: string, html: string) { this.sidebars.push({ title, html }); }
  showDialog(title: string, html: string) { this.dialogs.push({ title, html }); }
  alert(title: string, message: string) { this.alerts.push({ title, message }); }
  setMenu(name: string, items: (MenuItem | "separator")[]) { this.menu = { name, items }; }

  activity(): string[][] { return this.readRows("Activity"); }
}
