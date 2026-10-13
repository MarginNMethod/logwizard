// Entry points. build.mjs exposes each export below as a top-level function so Apps Script can call it
// from menus, triggers, and google.script.run.
import { activate as activateCore, buildMenu, guarded, handleFormSubmission, hourlyTick as hourlyCore, HELP_TEXT, previewPlanFromPaste, savePlanFromPaste, showPasteDialog, type PastePreview, runRoutingNow as routingCore, sendTestReminder as testCore, showSidebar, submitEntryFromSidebar } from "./core.js";
import { createGoogleServices, parseFormEvent } from "./google.js";

export function onOpen(): void {
  const svc = createGoogleServices();
  try {
    buildMenu(svc);
  } catch {
    svc.setMenu("LogWizard", [{ label: "Help", handler: "showHelp" }]);
  }
}

export function activate(): void {
  const svc = createGoogleServices();
  const r = guarded(svc, "Activate", () => activateCore(svc));
  if (r) svc.alert("Activate", r.message);
}

export function showPastePlanDialog(): void {
  const svc = createGoogleServices();
  guarded(svc, "Paste your plan", () => showPasteDialog(svc));
}

/** Called from the paste dialog through google.script.run. Never throws: the dialog shows the returned message. */
export function previewPlanFromDialog(text: string): PastePreview {
  const svc = createGoogleServices();
  const r = guarded(svc, "Check plan", () => previewPlanFromPaste(svc, text), false);
  return r ?? { ok: false, message: "Something went wrong. See the Activity tab." };
}

/** Called from the paste dialog through google.script.run, after the owner has seen the preview. Never throws. */
export function savePlanFromDialog(text: string): { ok: boolean; message: string; errors?: string[] } {
  const svc = createGoogleServices();
  const r = guarded(svc, "Paste your plan", () => savePlanFromPaste(svc, text), false);
  return r ?? { ok: false, message: "Something went wrong. See the Activity tab." };
}

export function showAddEntrySidebar(): void {
  const svc = createGoogleServices();
  guarded(svc, "Add entry", () => showSidebar(svc));
}

/** Called from the sidebar through google.script.run. Never throws: the sidebar shows the returned message. */
export function submitEntry(payload: unknown): { ok: boolean; message?: string; errors?: string[] } {
  const svc = createGoogleServices();
  const r = guarded(svc, "Add entry", () => submitEntryFromSidebar(svc, payload), false);
  return r ?? { ok: false, errors: ["Something went wrong. See the Activity tab."] };
}

export function onFormSubmit(e: GoogleAppsScript.Events.FormsOnFormSubmit): void {
  const svc = createGoogleServices();
  guarded(svc, "Form submit", () => handleFormSubmission(svc, parseFormEvent(e)), false);
}

export function runRoutingNow(): void {
  const svc = createGoogleServices();
  const m = guarded(svc, "Run routing", () => routingCore(svc));
  if (m) svc.alert("Run routing now", m);
}

export function sendTestReminder(): void {
  const svc = createGoogleServices();
  const m = guarded(svc, "Send test reminder", () => testCore(svc));
  if (m) svc.alert("Send test reminder", m);
}

export function hourlyTick(): void {
  const svc = createGoogleServices();
  guarded(svc, "Hourly check", () => hourlyCore(svc), false);
}

export function showHelp(): void {
  createGoogleServices().alert("Help", HELP_TEXT);
}
