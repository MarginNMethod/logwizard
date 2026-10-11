import { describe, it, expect } from "vitest";
import { routeEntry, planRouting } from "../src/index.js";
import { makePlan, makeEntry } from "./fixture.js";

const plan = makePlan();

describe("routeEntry", () => {
  it("multi_choice includes", () => expect(routeEntry(plan, "main", makeEntry())).toEqual(["education"]));
  it("matches several rules", () => expect(routeEntry(plan, "main", makeEntry({ values: { area: ["Education", "Arts"] } }))).toEqual(["education", "arts"]));
  it("choice equality, case-insensitive", () => expect(routeEntry(plan, "main", makeEntry({ values: { area: [], interaction: "event" } }))).toEqual(["arts"]));
  it("de-duplicates a target hit by two rules", () => expect(routeEntry(plan, "main", makeEntry({ values: { area: ["Arts"], interaction: "Event" } }))).toEqual(["arts"]));
  it("no match gives nothing", () => expect(routeEntry(plan, "main", makeEntry({ values: { area: ["Psychology"] } }))).toEqual([]));
  it("never routes to the source or from a non-source log", () => {
    expect(routeEntry(plan, "education", makeEntry())).toEqual([]);
    const self = makePlan({ routing_rules: [{ from: "main", when: { field: "area", includes: "Education" }, copy_to: "main" }] });
    expect(routeEntry(self, "main", makeEntry())).toEqual([]);
  });
  it("ignores targets that do not exist", () => {
    const p = makePlan({ routing_rules: [{ from: "main", when: { field: "area", includes: "Education" }, copy_to: "ghost" }] });
    expect(routeEntry(p, "main", makeEntry())).toEqual([]);
  });
});

describe("planRouting", () => {
  it("builds one row per target with the target's columns", () => {
    const r = planRouting(plan, "main", makeEntry({ values: { area: ["Education", "Arts"] } }), {});
    expect(r.rows.map((x) => x.logId)).toEqual(["education", "arts"]);
    expect(r.rows[0]!.entryId).toBe("e1");
    expect(r.rows[0]!.cells[0]).toBe("e1");
    expect(r.skippedDuplicates).toEqual([]);
  });
  it("is idempotent: second run adds nothing", () => {
    const entry = makeEntry({ values: { area: ["Education", "Arts"] } });
    const first = planRouting(plan, "main", entry, {});
    const existing: Record<string, string[]> = {};
    for (const row of first.rows) (existing[row.logId] ??= []).push(row.entryId);
    const second = planRouting(plan, "main", entry, existing);
    expect(second.rows).toEqual([]);
    expect(second.skippedDuplicates).toEqual(["education", "arts"]);
  });
  it("adds only the missing target", () => {
    const r = planRouting(plan, "main", makeEntry({ values: { area: ["Education", "Arts"] } }), { education: new Set(["e1"]) });
    expect(r.rows.map((x) => x.logId)).toEqual(["arts"]);
  });
  it("snapshot: copies hold the values at routing time", () => {
    const entry = makeEntry();
    const r = planRouting(plan, "main", entry, {});
    entry.values.org_name = "Changed";
    expect(r.rows[0]!.cells[3]).toBe("Acme");
  });
  it("sanitises formulas in copies", () => {
    const r = planRouting(plan, "main", makeEntry({ values: { org_name: "=1+1" } }), {});
    expect(r.rows[0]!.cells[3]).toBe("'=1+1");
  });
});
