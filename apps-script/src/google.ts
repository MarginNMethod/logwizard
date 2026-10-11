// The only file that touches Google services. It is deliberately thin: no decisions live here.
// Not unit-tested (it needs Google). It is typechecked, and every behaviour it assumes is listed as an H2 check in README.md.
import type { ColumnRule, FormInfo, FormItemSpec, FormSpec, FormSubmission, LogTabResult, LogTabSpec, MenuItem, Services, TriggerInfo } from "./services.js";

const PLAN_TAB = "_plan";

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function validation(rule: ColumnRule): GoogleAppsScript.Spreadsheet.DataValidation {
  const a1 = `${colLetter(rule.column)}2`;
  const b = SpreadsheetApp.newDataValidation();
  switch (rule.kind) {
    case "list":
      return b.requireValueInList(rule.options ?? [], true).setAllowInvalid(false).build();
    case "email":
      return b.requireTextIsEmail().setAllowInvalid(true).build();
    case "url":
      return b.requireTextIsUrl().setAllowInvalid(true).build();
    case "number":
      return b.requireFormulaSatisfied(`=OR(${a1}="",ISNUMBER(VALUE(${a1})))`).setAllowInvalid(true).setHelpText("Enter a number.").build();
    default:
      return b
        .requireFormulaSatisfied(`=OR(${a1}="",REGEXMATCH(${a1}&"","^\\d{4}-\\d{2}-\\d{2}$"))`)
        .setAllowInvalid(true)
        .setHelpText("Enter a date like 2026-03-01.")
        .build();
  }
}

function pad(rows: string[][]): string[][] {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => (r.length === w ? r : [...r, ...Array<string>(w - r.length).fill("")]));
}

function tune<T extends { setTitle(t: string): T; setRequired(b: boolean): T; setHelpText(t: string): T }>(it: T, s: FormItemSpec): T {
  it.setTitle(s.title).setRequired(s.required);
  if (s.help) it.setHelpText(s.help);
  return it;
}

function addItem(form: GoogleAppsScript.Forms.Form, s: FormItemSpec): void {
  const opts = s.options ?? [];
  switch (s.kind) {
    case "paragraph":
      tune(form.addParagraphTextItem(), s);
      return;
    case "date":
      tune(form.addDateItem(), s);
      return;
    case "list":
      tune(form.addListItem(), s).setChoiceValues(opts);
      return;
    case "checkbox":
      tune(form.addCheckboxItem(), s).setChoiceValues(opts);
      return;
    case "yes_no":
      tune(form.addMultipleChoiceItem(), s).setChoiceValues(["Yes", "No"]);
      return;
    default: {
      const item = tune(form.addTextItem(), s);
      if (s.kind === "email") item.setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
      else if (s.kind === "url") item.setValidation(FormApp.createTextValidation().requireTextIsUrl().build());
      else if (s.kind === "number") item.setValidation(FormApp.createTextValidation().requireNumber().build());
    }
  }
}

export function createGoogleServices(): Services {
  const ss = () => SpreadsheetApp.getActive();
  const props = () => PropertiesService.getScriptProperties();
  const cellText = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), "yyyy-MM-dd");
    return String(v);
  };

  return {
    now: () => new Date(),
    newId: () => Utilities.getUuid(),
    activeUserEmail() {
      try {
        return Session.getActiveUser().getEmail() || "";
      } catch {
        return "";
      }
    },

    readPlanText() {
      const sh = ss().getSheetByName(PLAN_TAB);
      if (!sh || sh.getLastRow() < 1) return null;
      const parts = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map((r) => String(r[0] ?? "")).filter((s) => s !== "");
      return parts.length ? parts.join("") : null;
    },
    setSpreadsheetTimeZone(tz) {
      ss().setSpreadsheetTimeZone(tz);
    },
    ensureLogTab(spec: LogTabSpec): LogTabResult {
      let sh = ss().getSheetByName(spec.name);
      const created = !sh;
      if (!sh) sh = ss().insertSheet(spec.name);
      const head = sh.getRange(1, 1, 1, spec.headers.length);
      const cur = head.getValues()[0]!.map(String);
      if (cur.every((c) => c === "")) {
        head.setNumberFormat("@").setValues([spec.headers]).setFontWeight("bold");
      } else if (cur.join("\u0001") !== spec.headers.join("\u0001")) {
        return { created, headerMismatch: true };
      }
      sh.setFrozenRows(1);
      const rows = Math.max(1, sh.getMaxRows() - 1);
      sh.getRange(2, 1, rows, spec.headers.length).setNumberFormat("@");
      for (const rule of spec.rules) sh.getRange(2, rule.column, rows, 1).setDataValidation(validation(rule));
      sh.autoResizeColumns(1, spec.headers.length);
      return { created, headerMismatch: false };
    },
    ensureInfoTab(name, headers) {
      const sh = ss().getSheetByName(name) ?? ss().insertSheet(name);
      if (sh.getLastRow() === 0) {
        sh.getRange(1, 1, 1, headers.length).setNumberFormat("@").setValues([headers]).setFontWeight("bold");
        sh.setFrozenRows(1);
      }
    },
    readRows(tab) {
      const sh = ss().getSheetByName(tab);
      if (!sh || sh.getLastRow() < 2) return [];
      return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().map((r) => r.map(cellText));
    },
    appendRows(tab, rows) {
      if (rows.length === 0) return;
      const sh = ss().getSheetByName(tab);
      if (!sh) throw new Error(`The tab "${tab}" is missing. Run Activate again.`);
      const data = pad(rows);
      const start = sh.getLastRow() + 1;
      const last = start + data.length - 1;
      if (last > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), last - sh.getMaxRows());
      sh.getRange(start, 1, data.length, data[0]!.length).setNumberFormat("@").setValues(data);
    },
    replaceSetup(rows) {
      const sh = ss().getSheetByName("Setup") ?? ss().insertSheet("Setup");
      const data = pad(rows);
      sh.clear();
      sh.getRange(1, 1, data.length, data[0]!.length).setNumberFormat("@").setValues(data);
      sh.getRange(1, 1, 1, data[0]!.length).setFontWeight("bold");
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, data[0]!.length);
    },
    withLock<T>(fn: () => T): T {
      const lock = LockService.getDocumentLock();
      lock.waitLock(30000);
      try {
        return fn();
      } finally {
        lock.releaseLock();
      }
    },

    getProp: (k) => props().getProperty(k),
    setProp: (k, v) => void props().setProperty(k, v),
    deleteProp: (k) => void props().deleteProperty(k),
    listPropKeys: () => Object.keys(props().getProperties()),

    ensureForm(spec: FormSpec, existingId: string | null): FormInfo {
      let form: GoogleAppsScript.Forms.Form | null = null;
      if (existingId) {
        try {
          form = FormApp.openById(existingId);
        } catch {
          form = null;
        }
      }
      const created = !form;
      if (!form) {
        form = FormApp.create(spec.title);
        form.setDescription(spec.description);
        form.setCollectEmail(true);
        form.setConfirmationMessage("Thanks. Your entry was recorded.");
      }
      const have = new Set(form.getItems().map((i) => i.getTitle().trim().toLowerCase()));
      const addedItems: string[] = [];
      for (const item of spec.items) {
        if (have.has(item.title.trim().toLowerCase())) continue;
        addItem(form, item);
        if (!created) addedItems.push(item.title);
      }
      return { id: form.getId(), url: form.getPublishedUrl(), created, addedItems };
    },

    listTriggers(): TriggerInfo[] {
      return ScriptApp.getProjectTriggers().map((t) => ({
        id: t.getUniqueId(),
        handler: t.getHandlerFunction(),
        kind: t.getEventType() === ScriptApp.EventType.CLOCK ? "time" : "form",
      }));
    },
    deleteTrigger(id) {
      for (const t of ScriptApp.getProjectTriggers()) if (t.getUniqueId() === id) ScriptApp.deleteTrigger(t);
    },
    createHourlyTrigger(handler) {
      ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
    },
    createFormSubmitTrigger(formId, handler) {
      ScriptApp.newTrigger(handler).forForm(FormApp.openById(formId)).onFormSubmit().create();
    },

    sendMail: (to, subject, body) => MailApp.sendEmail(to, subject, body),
    showSidebar(title, html) {
      SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(html).setTitle(title));
    },
    alert(title, message) {
      SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
    },
    setMenu(name, items: (MenuItem | "separator")[]) {
      const menu = SpreadsheetApp.getUi().createMenu(name);
      for (const it of items) {
        if (it === "separator") menu.addSeparator();
        else menu.addItem(it.label, it.handler);
      }
      menu.addToUi();
    },
  };
}

/** Turn the Forms submit event into plain data. */
export function parseFormEvent(e: GoogleAppsScript.Events.FormsOnFormSubmit): FormSubmission {
  const answers: Record<string, string | string[]> = {};
  for (const ir of e.response.getItemResponses()) {
    const r = ir.getResponse();
    answers[ir.getItem().getTitle()] = Array.isArray(r) ? (r as unknown[]).map((x) => String(x)) : String(r ?? "");
  }
  return {
    formId: e.source.getId(),
    responseId: e.response.getId(),
    timestamp: e.response.getTimestamp().toISOString(),
    email: e.response.getRespondentEmail() || "",
    answers,
  };
}
