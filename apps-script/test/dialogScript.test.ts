import { describe, expect, it } from "vitest";
import { buildSidebarHtml } from "../src/sidebar.js";
import { showPasteDialog } from "../src/core.js";
import { FakeServices, makePlan } from "./fakeServices.js";

/** Pull the inline script out of an HtmlService page. Google runs it in a browser, so it must parse and run there. */
function scriptOf(html: string): string {
  const m = /<script>([\s\S]*)<\/script>/.exec(html);
  expect(m).not.toBeNull();
  return m![1]!;
}

describe("browser scripts in dialogs and sidebar", () => {
  it("the paste dialog script is valid JavaScript", () => {
    const svc = new FakeServices(null);
    showPasteDialog(svc);
    expect(() => new Function(scriptOf(svc.dialogs[0]!.html))).not.toThrow();
  });

  it("the sidebar script is valid JavaScript", () => {
    expect(() => new Function(scriptOf(buildSidebarHtml(makePlan())))).not.toThrow();
  });

  it("Check plan calls previewPlanFromDialog with the box text and enables Save on success", () => {
    const svc = new FakeServices(null);
    showPasteDialog(svc);
    const els: Record<string, any> = {};
    const el = (id: string) =>
      (els[id] ??= { id, value: "", textContent: "", className: "", disabled: id === "save", style: {} });
    let called: { fn: string; arg: string } | null = null;
    let onOk: ((r: unknown) => void) | undefined;
    const run: any = {
      withSuccessHandler(f: (r: unknown) => void) { onOk = f; return run; },
      withFailureHandler() { return run; },
      previewPlanFromDialog(t: string) { called = { fn: "previewPlanFromDialog", arg: t }; },
    };
    new Function("document", "google", scriptOf(svc.dialogs[0]!.html))(
      { getElementById: el },
      { script: { run } },
    );
    el("plan").value = "{}";
    el("check").onclick();
    expect(called).toEqual({ fn: "previewPlanFromDialog", arg: "{}" });
    onOk!({ ok: true, summary: "S", recipients: ["a@example.com", "b@example.com"], replacing: false });
    expect(el("preview").textContent).toBe(
      "S\n\nThis sheet will email these people from your account:\na@example.com\nb@example.com",
    );
    expect(el("save").disabled).toBe(false);
  });
});
