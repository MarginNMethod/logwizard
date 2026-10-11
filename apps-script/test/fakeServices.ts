import { makePlan } from "../../packages/engine-logic/test/fixture.js";
import type { Plan } from "@logwizard/engine-logic";
import type { FormInfo, FormSpec, LogTabSpec, MenuItem, Services, TriggerInfo } from "../src/services.js";

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
  menu: { name: string; items: (MenuItem | "separator")[] } | null = null;
  lockCalls = 0;
  tz = "";
  nowValue = new Date("2026-03-01T15:00:00Z"); // 09:00 in America/Chicago
  user = "";
  failMail = false;
  /** Every appendRows call, for asserting what was written. */
  writes: { tab: string; rows: string[][] }[] = [];
  private seq = 0;

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
  setSpreadsheetTimeZone(tz: string) { this.tz = tz; }
  ensureLogTab(spec: LogTabSpec) {
    const created = !this.tabs.has(spec.name);
    if (created) this.tabs.set(spec.name, [spec.headers]);
    this.logTabSpecs.set(spec.name, spec);
    const head = this.tabs.get(spec.name)![0]!;
    return { created, headerMismatch: head.join("|") !== spec.headers.join("|") };
  }
  ensureInfoTab(name: string, headers: string[]) {
    if (!this.tabs.has(name)) this.tabs.set(name, [headers]);
  }
  readRows(tab: string) { return (this.tabs.get(tab) ?? []).slice(1).map((r) => [...r]); }
  appendRows(tab: string, rows: string[][]) {
    const t = this.tabs.get(tab);
    if (!t) throw new Error(`no tab ${tab}`);
    this.writes.push({ tab, rows });
    for (const r of rows) t.push([...r]);
  }
  replaceSetup(rows: string[][]) { this.tabs.set("Setup", rows); }
  withLock<T>(fn: () => T): T { this.lockCalls++; return fn(); }

  getProp = (k: string) => this.props.get(k) ?? null;
  setProp = (k: string, v: string) => void this.props.set(k, v);
  deleteProp = (k: string) => void this.props.delete(k);
  listPropKeys = () => [...this.props.keys()];

  ensureForm(spec: FormSpec, existingId: string | null): FormInfo {
    const found = existingId ? this.forms.find((f) => f.id === existingId) : undefined;
    if (found) return { id: found.id, url: found.url, created: false, addedItems: [] };
    const id = `form-${this.forms.length + 1}`;
    const f = { id, spec, url: `https://forms.example.com/${id}` };
    this.forms.push(f);
    return { id, url: f.url, created: true, addedItems: [] };
  }

  listTriggers = () => this.triggers.map(({ id, handler, kind }) => ({ id, handler, kind }));
  deleteTrigger(id: string) { this.triggers = this.triggers.filter((t) => t.id !== id); }
  createHourlyTrigger(handler: string) { this.triggers.push({ id: `t${++this.seq}`, handler, kind: "time" }); }
  createFormSubmitTrigger(formId: string, handler: string) { this.triggers.push({ id: `t${++this.seq}`, handler, kind: "form", formId }); }

  sendMail(to: string, subject: string, body: string) {
    if (this.failMail) throw new Error("mail down");
    this.mails.push({ to, subject, body });
  }
  showSidebar(title: string, html: string) { this.sidebars.push({ title, html }); }
  alert(title: string, message: string) { this.alerts.push({ title, message }); }
  setMenu(name: string, items: (MenuItem | "separator")[]) { this.menu = { name, items }; }

  activity(): string[][] { return this.readRows("Activity"); }
}
