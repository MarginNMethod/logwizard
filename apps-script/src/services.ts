// The thin boundary between the engine and Google. Everything in core.ts talks to this
// interface only, so it can be unit-tested with fakes. google.ts is the one real implementation.

export type RuleKind = "list" | "date" | "email" | "url" | "number";

/** Data validation for one column of a log tab. `column` is 1-based. */
export interface ColumnRule {
  column: number;
  kind: RuleKind;
  options?: string[];
}

export interface LogTabSpec {
  name: string;
  headers: string[];
  rules: ColumnRule[];
}

export interface LogTabResult {
  created: boolean;
  /** True when the tab already had different headers. The tab is left as it is (never overwritten). */
  headerMismatch: boolean;
}

export type FormItemKind = "text" | "paragraph" | "email" | "phone" | "date" | "number" | "url" | "list" | "checkbox" | "yes_no";

export interface FormItemSpec {
  title: string;
  kind: FormItemKind;
  required: boolean;
  options?: string[];
  help?: string;
}

export interface FormSpec {
  title: string;
  description: string;
  items: FormItemSpec[];
}

export interface FormInfo {
  id: string;
  url: string;
  created: boolean;
  /** Titles of questions added to an already existing form. Existing questions and responses are never removed. */
  addedItems: string[];
  /** Titles of existing questions whose choices or required flag were brought back in line with the plan. */
  updatedItems: string[];
  /** True when the form is set to collect VERIFIED respondent emails (not typed in by the respondent). */
  verifiedEmail: boolean;
}

export type TriggerKind = "time" | "form";

export interface TriggerInfo {
  id: string;
  handler: string;
  kind: TriggerKind;
}

export interface MenuItem {
  label: string;
  handler: string;
}

export interface Services {
  now(): Date;
  /** A new random id (Utilities.getUuid). */
  newId(): string;
  /** Email of the person using the spreadsheet right now, or "" when Google does not say. */
  activeUserEmail(): string;

  // Spreadsheet
  /** Text of the hidden _plan tab (all non-empty cells in column A joined), or null when the tab is missing or empty. */
  readPlanText(): string | null;
  setSpreadsheetTimeZone(timeZone: string): void;
  ensureLogTab(spec: LogTabSpec): LogTabResult;
  /** Create the Setup or Activity tab if missing. Headers are written only to an empty tab. */
  ensureInfoTab(name: "Setup" | "Activity", headers: string[]): void;
  /** Heading row of a tab with trailing blanks removed, or null when the tab is missing or has no headings. */
  readHeaders(tab: string): string[] | null;
  /** Add heading cells after the last existing heading. Never changes existing headings or data. */
  appendHeaders(tab: string, extra: string[]): void;
  /** Data rows (header excluded) as plain text. Dates come back as YYYY-MM-DD. Missing tab gives []. */
  readRows(tab: string): string[][];
  /** Append rows below the last row. Implementations set the range format to plain text "@" before writing. */
  appendRows(tab: string, rows: string[][]): void;
  /** Replace the contents of the Setup tab (it belongs to the engine, not to the user). */
  replaceSetup(rows: string[][]): void;
  /** Run fn under the script lock (one wait, throws "Lock timeout..." when busy). Callers must not nest it. */
  withLock<T>(fn: () => T): T;

  // Script properties
  getProp(key: string): string | null;
  setProp(key: string, value: string): void;
  deleteProp(key: string): void;
  listPropKeys(): string[];

  // Forms
  ensureForm(spec: FormSpec, existingId: string | null): FormInfo;

  // Triggers
  listTriggers(): TriggerInfo[];
  deleteTrigger(id: string): void;
  createHourlyTrigger(handler: string): void;
  createFormSubmitTrigger(formId: string, handler: string): void;

  /** Form responses submitted at or after sinceIso, as the trigger would have delivered them. */
  listFormResponses(formId: string, sinceIso: string): FormSubmission[];

  // Mail and UI
  /** MailApp.getRemainingDailyQuota(). */
  remainingQuota(): number;
  sendMail(to: string, subject: string, body: string): void;
  showSidebar(title: string, html: string): void;
  alert(title: string, message: string): void;
  setMenu(name: string, items: (MenuItem | "separator")[]): void;
}

/** What the Google layer extracts from a form-submit event. */
export interface FormSubmission {
  formId: string;
  responseId: string;
  /** ISO instant of the submission. */
  timestamp: string;
  /** Verified respondent email when Google provides it, else "". */
  email: string;
  /** Answers keyed by question title. */
  answers: Record<string, string | string[]>;
}
