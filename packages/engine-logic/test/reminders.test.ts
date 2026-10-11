import { describe, it, expect } from "vitest";
import { dueReminders, zonedParts, addDays, daysBetween } from "../src/index.js";
import { makePlan, makeEntry } from "./fixture.js";

const rows = (follow_up: string, id = "e1") => ({ main: [makeEntry({ id, values: { follow_up } })] });
const at = (iso: string) => new Date(iso);

describe("time helpers", () => {
  it("addDays and daysBetween cross month and leap boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });
  it("addDays across DST days is still exact", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  });
  it("zonedParts", () => {
    expect(zonedParts(at("2026-06-10T02:30:00Z"), "Asia/Kolkata")).toEqual({ date: "2026-06-10", hour: 8, day: "WED" });
    expect(zonedParts(at("2026-01-01T00:00:00Z"), "UTC")).toEqual({ date: "2026-01-01", hour: 0, day: "THU" });
  });
});

describe("dueReminders: America/Chicago", () => {
  it("before and after send_hour on a normal day (CST)", () => {
    const plan = makePlan();
    expect(dueReminders(plan, rows("2026-01-16"), at("2026-01-15T13:59:00Z"))).toEqual([]); // 07:59
    const r = dueReminders(plan, rows("2026-01-16"), at("2026-01-15T14:00:00Z")); // 08:00
    expect(r).toHaveLength(1);
    expect(r[0]!.to).toBe("owner@example.com");
    expect(r[0]!.items[0]).toMatchObject({ entryId: "e1", title: "Acme", dueDate: "2026-01-16", logName: "All Employers" });
  });
  it("wrong day is not due", () => {
    expect(dueReminders(makePlan(), rows("2026-01-17"), at("2026-01-15T15:00:00Z"))).toEqual([]);
    expect(dueReminders(makePlan(), rows("2026-01-15"), at("2026-01-15T15:00:00Z"))).toEqual([]);
  });

  describe("spring forward 2026-03-08 (02:00 CST -> 03:00 CDT at 08:00Z)", () => {
    const plan = makePlan({
      reminders: [{ type: "follow_up_due", log: "main", date_field: "follow_up", days_before: 1, notify: ["owner"], send_hour: 2 }],
    });
    it("send_hour 2 does not exist that day; sends at 03:00 local", () => {
      expect(dueReminders(plan, rows("2026-03-09"), at("2026-03-08T07:59:00Z"))).toEqual([]); // 01:59 CST
      expect(dueReminders(plan, rows("2026-03-09"), at("2026-03-08T08:00:00Z"))).toHaveLength(1); // 03:00 CDT
    });
    it("08:00 local sends at 13:00Z (CDT), not 14:00Z", () => {
      const p = makePlan();
      expect(dueReminders(p, rows("2026-03-09"), at("2026-03-08T12:59:00Z"))).toEqual([]);
      expect(dueReminders(p, rows("2026-03-09"), at("2026-03-08T13:00:00Z"))).toHaveLength(1);
    });
    it("day before: 08:00 CST is 14:00Z", () => {
      const p = makePlan();
      expect(dueReminders(p, rows("2026-03-08"), at("2026-03-07T13:59:00Z"))).toEqual([]);
      expect(dueReminders(p, rows("2026-03-08"), at("2026-03-07T14:00:00Z"))).toHaveLength(1);
    });
  });

  describe("fall back 2026-11-01 (02:00 CDT -> 01:00 CST at 07:00Z)", () => {
    it("local date near midnight differs from the UTC date", () => {
      const p = makePlan();
      expect(zonedParts(at("2026-11-01T04:59:00Z"), "America/Chicago")).toMatchObject({ date: "2026-10-31", hour: 23 });
      expect(zonedParts(at("2026-11-02T05:59:00Z"), "America/Chicago")).toMatchObject({ date: "2026-11-01", hour: 23 });
      // 23:30 local on 2026-11-01 is 05:30Z on 11-02 (CST): still the 1st locally.
      expect(dueReminders(makePlan({ reminders: [{ type: "follow_up_due", log: "main", date_field: "follow_up", days_before: 1, notify: ["owner"], send_hour: 0 }] }), rows("2026-11-02"), at("2026-11-02T05:30:00Z"))).toHaveLength(1);
      expect(dueReminders(p, rows("2026-11-02"), at("2026-11-01T12:59:00Z"))).toEqual([]); // 06:59 CST
    });
    it("repeated 01:00 hour sends once when sent keys are persisted", () => {
      const plan = makePlan({ reminders: [{ type: "follow_up_due", log: "main", date_field: "follow_up", days_before: 1, notify: ["owner"], send_hour: 1 }] });
      const first = dueReminders(plan, rows("2026-11-02"), at("2026-11-01T06:30:00Z")); // 01:30 CDT
      expect(first).toHaveLength(1);
      const sent = new Set(first.map((e) => e.key));
      expect(dueReminders(plan, rows("2026-11-02"), at("2026-11-01T07:30:00Z"), { sentKeys: sent })).toEqual([]); // 01:30 CST
      expect(dueReminders(plan, rows("2026-11-02"), at("2026-11-01T07:30:00Z"))).toHaveLength(1); // without keys it would resend
    });
    it("08:00 local after fall back is 14:00Z", () => {
      const p = makePlan();
      expect(dueReminders(p, rows("2026-11-02"), at("2026-11-01T13:59:00Z"))).toEqual([]);
      expect(dueReminders(p, rows("2026-11-02"), at("2026-11-01T14:00:00Z"))).toHaveLength(1);
    });
  });
});

describe("dueReminders: other zones", () => {
  it("Asia/Kolkata half hour offset: 08:00 IST is 02:30Z", () => {
    const p = makePlan({ time_zone: "Asia/Kolkata" });
    expect(dueReminders(p, rows("2026-06-11"), at("2026-06-10T02:29:00Z"))).toEqual([]);
    expect(dueReminders(p, rows("2026-06-11"), at("2026-06-10T02:30:00Z"))).toHaveLength(1);
  });
  it("Asia/Kolkata: UTC evening is already the next local day", () => {
    const p = makePlan({ time_zone: "Asia/Kolkata" });
    // 2026-06-10T20:00Z = 2026-06-11 01:30 IST, so a follow-up on 06-12 with 1 day before is due once hour >= 0.
    const p0 = makePlan({ time_zone: "Asia/Kolkata", reminders: [{ type: "follow_up_due", log: "main", date_field: "follow_up", days_before: 1, notify: ["owner"], send_hour: 0 }] });
    expect(dueReminders(p0, rows("2026-06-12"), at("2026-06-10T20:00:00Z"))).toHaveLength(1);
    expect(dueReminders(p, rows("2026-06-12"), at("2026-06-10T20:00:00Z"))).toEqual([]); // hour 1 < 8
  });
  it("UTC", () => {
    const p = makePlan({ time_zone: "UTC" });
    expect(dueReminders(p, rows("2026-05-02"), at("2026-05-01T07:59:00Z"))).toEqual([]);
    expect(dueReminders(p, rows("2026-05-02"), at("2026-05-01T08:00:00Z"))).toHaveLength(1);
  });
});

describe("dueReminders: grouping and resolution", () => {
  it("one email per person per day across reminders and rows", () => {
    const plan = makePlan({
      reminders: [
        { type: "follow_up_due", log: "main", date_field: "follow_up", days_before: 1, notify: ["owner", "contributors"], send_hour: 8 },
        { type: "follow_up_due", log: "main", date_field: "follow_up", days_before: 0, notify: ["OWNER@example.com"], send_hour: 8 },
      ],
    });
    const rowsByLog = { main: [makeEntry({ id: "a", values: { follow_up: "2026-01-16" } }), makeEntry({ id: "b", values: { follow_up: "2026-01-15" } })] };
    const r = dueReminders(plan, rowsByLog, at("2026-01-15T14:00:00Z"));
    expect(r.map((e) => e.to).sort()).toEqual(["owner@example.com", "rep@example.com"]);
    expect(r.find((e) => e.to === "owner@example.com")!.items.map((i) => i.entryId).sort()).toEqual(["a", "b"]);
    expect(r.find((e) => e.to === "rep@example.com")!.items).toHaveLength(1);
  });
  it("same row matched by two reminders is listed once", () => {
    const rem = { type: "follow_up_due" as const, log: "main", date_field: "follow_up", days_before: 1, notify: ["owner"], send_hour: 8 };
    const r = dueReminders(makePlan({ reminders: [rem, { ...rem }] }), rows("2026-01-16"), at("2026-01-15T14:00:00Z"));
    expect(r[0]!.items).toHaveLength(1);
  });
  it("resolves the date field through the source log for a copy log", () => {
    const plan = makePlan({
      reminders: [{ type: "follow_up_due", log: "education", date_field: "follow_up", days_before: 2, notify: ["owner"], send_hour: 8 }],
    });
    const r = dueReminders(plan, { education: [makeEntry({ id: "c", values: { follow_up: "2026-01-17" } })] }, at("2026-01-15T14:00:00Z"));
    expect(r[0]!.items[0]).toMatchObject({ logId: "education", logName: "Education Log", entryId: "c" });
  });
  it("ignores blank or invalid dates, and send_hour can be bypassed for tests", () => {
    expect(dueReminders(makePlan(), rows(""), at("2026-01-15T14:00:00Z"))).toEqual([]);
    expect(dueReminders(makePlan(), rows("not a date"), at("2026-01-15T14:00:00Z"))).toEqual([]);
    expect(dueReminders(makePlan(), rows("2026-01-16"), at("2026-01-15T10:00:00Z"), { ignoreSendHour: true })).toHaveLength(1);
  });
});
