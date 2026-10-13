import { describe, expect, it } from "vitest";
import { MAX_PLAN_BYTES } from "@logwizard/plan-schema";
import { buildMenu, loadPlan, PASTE_ONLY_MENU, savePlanFromPaste, showPasteDialog } from "../src/core.js";
import { FakeServices, makePlan } from "./fakeServices.js";

const labels = (svc: FakeServices) => svc.menu!.items.map((i) => (i === "separator" ? "-" : i.label));

describe("savePlanFromPaste", () => {
  it("accepts a bare plan and writes it to the hidden _plan tab", () => {
    const svc = new FakeServices(null);
    const r = savePlanFromPaste(svc, JSON.stringify(makePlan()));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("Activate");
    expect(svc.planTabHidden).toBe(true);
    const loaded = loadPlan(svc);
    expect(loaded.ok && loaded.plan.system_name).toBe(makePlan().system_name);
  });

  it("accepts the planner reply envelope", () => {
    const svc = new FakeServices(null);
    const env = { plan: makePlan(), follow_up_questions: [], unsupported_requests: [] };
    expect(savePlanFromPaste(svc, JSON.stringify(env)).ok).toBe(true);
    expect(loadPlan(svc).ok).toBe(true);
  });

  it("accepts the downloaded file shape (pretty printed, trailing newline)", () => {
    const svc = new FakeServices(null);
    expect(savePlanFromPaste(svc, JSON.stringify(makePlan(), null, 2) + "\n").ok).toBe(true);
    expect(loadPlan(svc).ok).toBe(true);
  });

  it("rejects text that is not JSON and writes nothing", () => {
    const svc = new FakeServices(null);
    const r = savePlanFromPaste(svc, "this is not a plan");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/copy/i);
    expect(svc.tabs.has("_plan")).toBe(false);
  });

  it("rejects an empty paste", () => {
    const svc = new FakeServices(null);
    expect(savePlanFromPaste(svc, "   ").ok).toBe(false);
    expect(svc.tabs.has("_plan")).toBe(false);
  });

  it("rejects a plan that fails the schema, lists plain errors, and keeps the old plan", () => {
    const svc = new FakeServices(makePlan());
    const before = svc.readPlanText();
    const bad = { ...makePlan(), time_zone: "Mars/Olympus" };
    const r = savePlanFromPaste(svc, JSON.stringify(bad));
    expect(r.ok).toBe(false);
    expect(r.errors!.length).toBeGreaterThan(0);
    expect(r.errors!.length).toBeLessThanOrEqual(5);
    expect(svc.readPlanText()).toBe(before);
  });

  it("rejects an envelope with no plan", () => {
    const svc = new FakeServices(null);
    const r = savePlanFromPaste(svc, JSON.stringify({ plan: null, follow_up_questions: ["Who?"], unsupported_requests: [] }));
    expect(r.ok).toBe(false);
    expect(svc.tabs.has("_plan")).toBe(false);
  });

  it("rejects oversize text before parsing", () => {
    const svc = new FakeServices(null);
    const r = savePlanFromPaste(svc, " ".repeat(MAX_PLAN_BYTES * 3 + 1));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/too large/i);
    expect(svc.tabs.has("_plan")).toBe(false);
  });

  it("sets the owner email to the active user and says so", () => {
    const svc = new FakeServices(null);
    svc.user = "me@example.com";
    const r = savePlanFromPaste(svc, JSON.stringify(makePlan()));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("me@example.com");
    const loaded = loadPlan(svc);
    expect(loaded.ok && loaded.plan.owner.email).toBe("me@example.com");
    expect(loaded.ok && loaded.plan.owner.name).toBe(makePlan().owner.name);
  });

  it("keeps the plan's owner when Google gives no active user", () => {
    const svc = new FakeServices(null);
    savePlanFromPaste(svc, JSON.stringify(makePlan()));
    const loaded = loadPlan(svc);
    expect(loaded.ok && loaded.plan.owner.email).toBe(makePlan().owner.email);
  });

  it("writes a long plan in chunks that read back whole, and logs one Activity line", () => {
    const svc = new FakeServices(null);
    const plan = makePlan();
    plan.owner.name = "A".repeat(80);
    savePlanFromPaste(svc, JSON.stringify(plan));
    expect(svc.activity()).toHaveLength(1);
    expect(svc.activity()[0]![1]).toBe("info");
  });

  it("replaces an existing plan", () => {
    const svc = new FakeServices(makePlan());
    const next = { ...makePlan(), system_name: "Second System" };
    expect(savePlanFromPaste(svc, JSON.stringify(next)).ok).toBe(true);
    const loaded = loadPlan(svc);
    expect(loaded.ok && loaded.plan.system_name).toBe("Second System");
  });
});

describe("menu and dialog", () => {
  it("shows only Paste your plan and Help when there is no plan", () => {
    const svc = new FakeServices(null);
    buildMenu(svc);
    expect(svc.menu!.name).toBe("LogWizard");
    expect(labels(svc)).toEqual(PASTE_ONLY_MENU.map((i) => i.label));
    expect(labels(svc)).toEqual(["Paste your plan", "Help"]);
  });

  it("shows the paste-only menu when the _plan tab is empty or invalid", () => {
    const svc = new FakeServices("");
    buildMenu(svc);
    expect(labels(svc)).toEqual(["Paste your plan", "Help"]);
    const bad = new FakeServices("{nope");
    buildMenu(bad);
    expect(labels(bad)).toEqual(["Paste your plan", "Help"]);
  });

  it("keeps the full menu plus Replace plan when a plan exists", () => {
    const svc = new FakeServices(makePlan());
    buildMenu(svc);
    expect(svc.menu!.name).toBe(makePlan().system_name);
    const l = labels(svc);
    expect(l).toContain("Replace plan");
    expect(l).toContain("Activate");
    expect(l.indexOf("Replace plan")).toBeLessThan(l.indexOf("Activate"));
  });

  it("opens a dialog with a textarea and a Save button wired to savePlanFromDialog", () => {
    const svc = new FakeServices(null);
    showPasteDialog(svc);
    const d = svc.dialogs[0]!;
    expect(d.html).toContain("<textarea");
    expect(d.html).toContain("Save");
    expect(d.html).toContain("savePlanFromDialog");
  });
});
