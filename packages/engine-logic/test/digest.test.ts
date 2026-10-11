import { describe, it, expect } from "vitest";
import { isDigestDue, dueDigests, buildDigest, digestsToSend } from "../src/index.js";
import { makePlan, makeEntry } from "./fixture.js";

const at = (iso: string) => new Date(iso);

describe("isDigestDue", () => {
  const plan = makePlan(); // MON 8, Chicago
  it("due on the right day after the hour", () => {
    expect(isDigestDue(plan, at("2026-03-02T13:59:00Z"))).toBe(false); // Mon 07:59 CST
    expect(isDigestDue(plan, at("2026-03-02T14:00:00Z"))).toBe(true);
  });
  it("wrong day is not due", () => expect(isDigestDue(plan, at("2026-03-03T15:00:00Z"))).toBe(false));
  it("uses the plan time zone for the day: Sunday night UTC-side is Monday in Kolkata", () => {
    const k = makePlan({ time_zone: "Asia/Kolkata" });
    expect(isDigestDue(k, at("2026-03-02T02:30:00Z"))).toBe(true); // Mon 08:00 IST
    expect(isDigestDue(k, at("2026-03-01T20:00:00Z"))).toBe(false); // Mon 01:30 IST, before the hour
    expect(isDigestDue(plan, at("2026-03-02T03:00:00Z"))).toBe(false); // still Sunday 21:00 in Chicago
  });
  it("DST: Monday 08:00 CDT after spring forward is 13:00Z", () => {
    expect(isDigestDue(plan, at("2026-03-09T12:59:00Z"))).toBe(false);
    expect(isDigestDue(plan, at("2026-03-09T13:00:00Z"))).toBe(true);
  });
  it("no digest reminder means never due", () => {
    expect(isDigestDue(makePlan({ reminders: [] }), at("2026-03-02T15:00:00Z"))).toBe(false);
    expect(dueDigests(makePlan({ reminders: [] }), at("2026-03-02T15:00:00Z"))).toEqual([]);
  });
});

describe("buildDigest", () => {
  const now = at("2026-03-02T14:00:00Z"); // Mon 2026-03-02 08:00 CST
  const plan = makePlan();
  const rowsByLog = {
    main: [
      makeEntry({ id: "n1", enteredAt: "2026-02-28T10:00:00Z", values: { org_name: "New Co", follow_up: "2026-03-05" } }),
      makeEntry({ id: "old", enteredAt: "2026-02-01T10:00:00Z", values: { org_name: "Old Co", follow_up: "2026-02-20" } }),
      makeEntry({ id: "far", enteredAt: "2026-01-01T10:00:00Z", values: { org_name: "Far Co", follow_up: "2026-04-30" } }),
      makeEntry({ id: "today", enteredAt: "2026-01-01T10:00:00Z", values: { org_name: "Today Co", follow_up: "2026-03-02" } }),
    ],
    education: [makeEntry({ id: "n1", enteredAt: "2026-02-28T10:00:00Z", values: { org_name: "New Co" } })],
  };
  const d = buildDigest(plan, rowsByLog, now);
  it("groups by log and omits quiet logs", () => {
    expect(d.logs.map((l) => l.logId)).toEqual(["main", "education"]);
    expect(d.localDate).toBe("2026-03-02");
  });
  it("new entries, upcoming (sorted), overdue", () => {
    const main = d.logs[0]!;
    expect(main.newEntries.map((r) => r.entryId)).toEqual(["n1"]);
    expect(main.upcoming.map((r) => r.entryId)).toEqual(["today", "n1"]);
    expect(main.overdue.map((r) => r.entryId)).toEqual(["old"]);
    expect(main.upcoming[0]!.title).toBe("Today Co");
  });
  it("totals", () => expect(d.totals).toEqual({ newEntries: 2, upcoming: 2, overdue: 1 }));
  it("empty rows give an empty digest", () => expect(buildDigest(plan, {}, now).logs).toEqual([]));
});

describe("digestsToSend", () => {
  const plan = makePlan({ reminders: [{ type: "weekly_digest", day: "MON", send_hour: 8, notify: ["owner", "contributors", "OWNER@example.com"] }] });
  it("one per recipient, and respects sent keys", () => {
    const now = at("2026-03-02T14:00:00Z");
    const out = digestsToSend(plan, {}, now);
    expect(out.map((o) => o.to)).toEqual(["owner@example.com", "rep@example.com"]);
    const again = digestsToSend(plan, {}, now, new Set(out.map((o) => o.key)));
    expect(again).toEqual([]);
  });
  it("nothing when not due", () => expect(digestsToSend(plan, {}, at("2026-03-03T14:00:00Z"))).toEqual([]));
});
