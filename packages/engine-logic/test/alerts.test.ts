import { describe, it, expect } from "vitest";
import { alertsForSubmission, identifySubmitter } from "../src/index.js";
import { makePlan } from "./fixture.js";

const plan = makePlan();

describe("identifySubmitter", () => {
  it("owner, case-insensitive", () => expect(identifySubmitter(plan, " OWNER@Example.com ").kind).toBe("owner"));
  it("contributor, case-insensitive", () => expect(identifySubmitter(plan, "rep@EXAMPLE.COM")).toEqual({ kind: "contributor", name: "Sample Rep" }));
  it("unknown", () => {
    expect(identifySubmitter(plan, "x@example.com").kind).toBe("unknown");
    expect(identifySubmitter(plan, "").kind).toBe("unknown");
    expect(identifySubmitter(plan, null).kind).toBe("unknown");
  });
});

describe("alertsForSubmission", () => {
  it("owner submits: nobody is alerted", () => expect(alertsForSubmission(plan, "owner@example.com").notify).toEqual([]));
  it("contributor submits: owner is alerted", () => expect(alertsForSubmission(plan, "REP@example.com").notify).toEqual(["owner@example.com"]));
  it("unknown or missing submitter still alerts", () => {
    expect(alertsForSubmission(plan, "x@example.com").notify).toEqual(["owner@example.com"]);
    expect(alertsForSubmission(plan, undefined).notify).toEqual(["owner@example.com"]);
  });
  it("never alerts the submitter about their own entry, and dedupes", () => {
    const p = makePlan({
      alerts: [
        { on: "new_entry", when_entered_by: "contributor", notify: ["owner", "contributors"] },
        { on: "new_entry", when_entered_by: "contributor", notify: ["Owner@example.com"] },
      ],
    });
    expect(alertsForSubmission(p, "rep@example.com").notify).toEqual(["owner@example.com"]);
  });
  it("no alerts configured means no notifications", () => expect(alertsForSubmission(makePlan({ alerts: [] }), "rep@example.com").notify).toEqual([]));
});
