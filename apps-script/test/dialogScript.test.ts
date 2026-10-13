import { describe, expect, it } from "vitest";
import { buildSidebarHtml } from "../src/sidebar.js";
import { previewBlocks, showPasteDialog } from "../src/core.js";
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

  it("Check plan calls previewPlanFromDialog, draws headings, paragraphs and bullet lists, and enables Save", () => {
    const svc = new FakeServices(null);
    showPasteDialog(svc);
    const els: Record<string, any> = {};
    const mk = (tag: string) => ({ tag, children: [] as any[], className: "", textContent: "", appendChild(c: any) { this.children.push(c); } });
    const el = (id: string) =>
      (els[id] ??= Object.assign(mk("div"), { id, value: "", disabled: id === "save", style: {} }));
    let called: { fn: string; arg: string } | null = null;
    let onOk: ((r: unknown) => void) | undefined;
    const run: any = {
      withSuccessHandler(f: (r: unknown) => void) { onOk = f; return run; },
      withFailureHandler() { return run; },
      previewPlanFromDialog(t: string) { called = { fn: "previewPlanFromDialog", arg: t }; },
    };
    new Function("document", "google", scriptOf(svc.dialogs[0]!.html))(
      { getElementById: el, createElement: mk },
      { script: { run } },
    );
    el("plan").value = "{}";
    el("check").onclick();
    expect(called).toEqual({ fn: "previewPlanFromDialog", arg: "{}" });
    onOk!({
      ok: true,
      blocks: [
        { t: "p", s: "Intro" },
        { t: "h", s: "Logs" },
        { t: "li", s: "One" },
        { t: "li", s: "Two" },
        { t: "h", s: "People" },
        { t: "li", s: "a@example.com" },
      ],
    });
    const kids = els.preview.children;
    expect(kids.map((k: any) => k.tag + (k.className ? "." + k.className : ""))).toEqual(["p", "div.h", "ul", "div.h", "ul"]);
    expect(kids[2].children.map((c: any) => c.textContent)).toEqual(["One", "Two"]);
    expect(kids[4].children.map((c: any) => c.textContent)).toEqual(["a@example.com"]);
    expect(els.save.disabled).toBe(false);
  });
});

describe("previewBlocks", () => {
  const summary = [
    'Your system "X" will use the time zone Mountain Time (America/Denver).',
    "I will create 2 logs:",
    '- "A" with 3 fields: a, b, and c.',
    '- "B" with the same fields as "A".',
    "Alerts:",
    "- When a contributor adds a new entry, I will email the owner (o@example.com).",
  ].join("\n");

  it("makes headings, paragraphs and bullets, then lists who is emailed as bullets", () => {
    expect(previewBlocks(summary, ["r@example.com", "t@example.com"], false)).toEqual([
      { t: "p", s: 'Your system "X" will use the time zone Mountain Time (America/Denver).' },
      { t: "h", s: "I will create 2 logs" },
      { t: "li", s: '"A" with 3 fields: a, b, and c.' },
      { t: "li", s: '"B" with the same fields as "A".' },
      { t: "h", s: "Alerts" },
      { t: "li", s: "When a contributor adds a new entry, I will email the owner (o@example.com)." },
      { t: "h", s: "This sheet will email these people from your account" },
      { t: "li", s: "r@example.com" },
      { t: "li", s: "t@example.com" },
    ]);
  });

  it("says so when no one is emailed, and notes a replacement", () => {
    const b = previewBlocks("Hello.", [], true);
    expect(b.slice(-2)).toEqual([
      { t: "p", s: "No one else will be emailed from this sheet." },
      { t: "p", s: "This replaces the plan already saved in this sheet." },
    ]);
  });
});
