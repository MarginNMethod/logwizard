import { describe, expect, it } from "vitest";
import { activate, addEntry, handleFormSubmission, hourlyTick, loadPlan, runRoutingNow, submitEntryFromSidebar } from "../src/core.js";
import { FakeServices, makePlan } from "./fakeServices.js";
import type { Plan } from "@logwizard/engine-logic";

const OTHER = "- Other -";
const hostilePlan = (): Plan => {
  const plan = makePlan();
  plan.logs[0]!.fields!.find((f) => f.key === "interaction")!.options!.push(OTHER);
  return plan;
};
const activated = (plan: Plan = hostilePlan()) => {
  const svc = new FakeServices(plan);
  expect(activate(svc).ok, "activate").toBe(true);
  return svc;
};
const loadOk = (svc: FakeServices) => {
  const l = loadPlan(svc);
  if (!l.ok) throw new Error(l.message);
  return l.plan;
};
const base = { org_name: "Acme", interaction: "Email", date: "2026-03-01", area: ["Education", "Arts"], follow_up: "2026-03-02" };
const add = (svc: FakeServices, raw: Record<string, unknown>, seed = "s1", name = "") =>
  addEntry(svc, loadOk(svc), { logId: "main", raw, submitterEmail: "owner@example.com", submitterName: name, seed, submittedAt: "2026-03-01T14:00:00.000Z" });

const ORG = 3; // Organization column index in All Employers
const INTERACTION = 5;
const HOSTILE = ["=SUM(A1)", '=HYPERLINK("http://x","y")', "+1+1", "-A1", "@SUM(A1)", " =SUM(A1)", " =1+1", "\t=1", "'=SUM(A1)", "''=x"];

describe("formula injection (real Google: setValues evaluates a leading = even in an @ cell)", () => {
  it.each(HOSTILE)("stores %j as inert text and reads it back unchanged, in the log and the routed copy", (v) => {
    const svc = activated();
    expect(add(svc, { ...base, org_name: v, notes: v }).ok).toBe(true);
    expect(svc.formulaCells).toEqual([]);
    const written = svc.tabs.get("All Employers")![1]!;
    expect(written[ORG]!.startsWith("=")).toBe(false);
    // routed copy: written once, no doubling, and the copy log is also free of formulas
    expect(svc.readRows("Education Log")).toHaveLength(1);
    expect(svc.tabs.get("Education Log")![1]![ORG]).toBe(written[ORG]);
    // delete the copy and route again from the stored (prefixed) row: the apostrophe count must not grow
    svc.tabs.set("Education Log", [svc.tabs.get("Education Log")![0]!]);
    svc.tabs.set("Arts Log", [svc.tabs.get("Arts Log")![0]!]);
    runRoutingNow(svc);
    expect(svc.tabs.get("Education Log")![1]![ORG]).toBe(written[ORG]);
    expect(svc.tabs.get("Arts Log")![1]![ORG]).toBe(written[ORG]);
    expect(svc.formulaCells).toEqual([]);
    // a second route pass is a no-op
    runRoutingNow(svc);
    expect(svc.readRows("Education Log")).toHaveLength(1);
  });

  it("exact rule: apostrophe added in front of = + - @ (after optional spaces), tab or CR, and of apostrophe-led versions of those", () => {
    const svc = activated();
    const cases: [string, string][] = [
      ["=SUM(A1)", "'=SUM(A1)"], ['=HYPERLINK("http://x","y")', "'=HYPERLINK(\"http://x\",\"y\")"], ["+1+1", "'+1+1"], ["-A1", "'-A1"],
      ["@SUM(A1)", "'@SUM(A1)"], [" =SUM(A1)", "'=SUM(A1)"], // the normaliser trims leading spaces first
      ["\u00a0=1", "'=1"], ["Acme", "Acme"], ["'abc", "'abc"], ["'=x", "''=x"], ["a=b", "a=b"],
    ];
    cases.forEach(([raw, stored], i) => {
      add(svc, { ...base, org_name: raw }, `seed${i}`);
      expect(svc.tabs.get("All Employers")![i + 1]![ORG], raw).toBe(stored);
    });
  });

  it("does not prefix an exact option of a strict list column, but does prefix the same text in a free-text column", () => {
    const svc = activated();
    add(svc, { ...base, interaction: OTHER, org_name: OTHER, notes: OTHER });
    const row = svc.tabs.get("All Employers")![1]!;
    const head = svc.tabs.get("All Employers")![0]!;
    expect(row[INTERACTION]).toBe(OTHER);
    expect(row[ORG]).toBe(`'${OTHER}`);
    expect(row[head.indexOf("Notes")]).toBe(`'${OTHER}`);
    // the routed copies keep the option unprefixed in the list column too
    expect(svc.tabs.get("Education Log")![1]![INTERACTION]).toBe(OTHER);
    expect(svc.formulaCells).toEqual([]);
  });

  it("round-trips the option through read and routing without gaining apostrophes", () => {
    const svc = activated();
    add(svc, { ...base, interaction: OTHER });
    svc.tabs.set("Arts Log", [svc.tabs.get("Arts Log")![0]!]);
    runRoutingNow(svc);
    expect(svc.tabs.get("Arts Log")![1]![INTERACTION]).toBe(OTHER);
  });
});

describe("no written cell is ever a formula (fake that evaluates a leading = like real Google)", () => {
  const evil = "=HYPERLINK(\"http://evil.example\",\"x\")";
  const sub = (id: string, name: string, v: string) => ({
    formId: "form-1", responseId: id, timestamp: "2026-03-01T14:00:00.000Z", email: "rep@example.com",
    answers: {
      "Your name": name, Organization: v, "Interaction type": OTHER, Date: "2026-03-01", Area: ["Education", "Arts"],
      "Follow-up date": "2026-03-02", Notes: v, "Contact email": "a@example.com",
    } as Record<string, string | string[]>,
  });

  it("form submit, sidebar submit, routing, activate, alerts and the hourly tick", () => {
    const svc = activated();
    for (const [i, v] of HOSTILE.entries()) {
      handleFormSubmission(svc, sub(`r${i}`, v, v));
      submitEntryFromSidebar(svc, { logId: "main", raw: { ...base, org_name: v, notes: v }, seed: `sb${i}` });
    }
    handleFormSubmission(svc, sub("rx", evil, evil));
    // an unverified contributor name goes into the alert and Activity
    svc.user = evil;
    submitEntryFromSidebar(svc, { logId: "main", raw: { ...base, org_name: evil }, seed: "sbx" });
    svc.tabs.set("Education Log", [svc.tabs.get("Education Log")![0]!]);
    runRoutingNow(svc);
    hourlyTick(svc);
    expect(activate(svc).ok).toBe(true);
    // activity messages naming the hostile contributor were written
    expect(svc.activity().length).toBeGreaterThan(0);
    expect(svc.formulaCells).toEqual([]);
    for (const [tab, rows] of svc.tabs) {
      if (tab === "_plan") continue;
      rows.forEach((r, ri) => r.forEach((c, ci) => expect(c.startsWith("="), `${tab} r${ri + 1}c${ci + 1}: ${c}`).toBe(false)));
    }
  });

  it("the fake really does flag a raw formula write (guards the guard)", () => {
    const svc = new FakeServices(makePlan());
    svc.tabs.set("T", [["h"]]);
    svc.appendRows("T", [["=SUM(A1)"]]);
    expect(svc.formulaCells).toHaveLength(1);
  });
});
