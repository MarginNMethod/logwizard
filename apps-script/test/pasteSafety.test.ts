import { describe, expect, it } from "vitest";
import { chunkPlan, loadPlan, previewPlanFromPaste, savePlanFromPaste } from "../src/core.js";
import { FakeServices, makePlan } from "./fakeServices.js";

const planWith = (over: Record<string, unknown>) => ({ ...makePlan(), ...over });

describe("M1: recipients are shown before anything is saved", () => {
  it("previews the summary and every contributor address, and writes nothing", () => {
    const svc = new FakeServices(null);
    const r = previewPlanFromPaste(svc, JSON.stringify(makePlan()));
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Employer Outreach Log");
    expect(r.recipients).toEqual(makePlan().contributors.map((c) => c.email.toLowerCase()));
    expect(svc.readPlanText()).toBeNull();
  });

  it("previews problems the same way as save, without writing", () => {
    const svc = new FakeServices(null);
    const r = previewPlanFromPaste(svc, "{}");
    expect(r.ok).toBe(false);
    expect(svc.readPlanText()).toBeNull();
  });
});

describe("L1: the owner override is re-checked", () => {
  it("refuses when the signed-in user was the only contributor, because the alert would have no one to fire on", () => {
    const svc = new FakeServices(null);
    svc.user = makePlan().contributors[0]!.email;
    const r = savePlanFromPaste(svc, JSON.stringify(makePlan()));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("once you are set as the owner");
    expect(svc.readPlanText()).toBeNull();
  });

  it("keeps the other contributors when the signed-in user is one of several", () => {
    const svc = new FakeServices(null);
    const plan = planWith({ contributors: [makePlan().contributors[0], { name: "Second Rep", email: "second@example.com", role: "contributor" }] });
    svc.user = makePlan().contributors[0]!.email;
    const r = savePlanFromPaste(svc, JSON.stringify(plan));
    expect(r.ok).toBe(true);
    const loaded = loadPlan(svc);
    expect(loaded.ok && loaded.plan.contributors.map((c) => c.email)).toEqual(["second@example.com"]);
  });

  it("rewrites notify targets that named the old owner, so the saved plan loads", () => {
    const svc = new FakeServices(null);
    const plan = planWith({ alerts: [{ on: "new_entry", when_entered_by: "contributor", notify: [makePlan().owner.email] }] });
    svc.user = "signed-in@example.com";
    const r = savePlanFromPaste(svc, JSON.stringify(plan));
    expect(r.ok).toBe(true);
    const loaded = loadPlan(svc);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.plan.alerts[0]!.notify).toEqual(["owner"]);
  });
});

describe("L2: no chunk starts with a character Sheets can read as a formula", () => {
  it("never begins a chunk with = + - @ or an apostrophe, and the chunks join back to the same text", () => {
    const json = "a".repeat(39999) + "=" + "b".repeat(50) + "@" + "c".repeat(40000) + "-" + "d".repeat(3);
    const chunks = chunkPlan(json);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks.slice(1)) expect(/^[=+\-@']/.test(c)).toBe(false);
    expect(chunks.join("")).toBe(json);
  });
});

describe("L3: only the owner can replace a plan", () => {
  it("refuses a replacement from another signed-in user and keeps the existing plan", () => {
    const svc = new FakeServices(null);
    svc.user = "owner@example.com";
    expect(savePlanFromPaste(svc, JSON.stringify(makePlan())).ok).toBe(true);
    const before = svc.readPlanText();
    svc.user = "editor@example.com";
    const r = savePlanFromPaste(svc, JSON.stringify(makePlan()));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Only the owner");
    expect(svc.readPlanText()).toBe(before);
  });

  it("refuses a replacement when Google gives no signed-in user and a plan exists", () => {
    const svc = new FakeServices(null);
    svc.user = "owner@example.com";
    savePlanFromPaste(svc, JSON.stringify(makePlan()));
    svc.user = "";
    expect(savePlanFromPaste(svc, JSON.stringify(makePlan())).ok).toBe(false);
  });
});
