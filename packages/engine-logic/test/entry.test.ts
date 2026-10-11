import { describe, it, expect } from "vitest";
import { makeEntryId, sanitizeCellValue, normaliseEntry, normaliseValue, headersForLog, entryToCells } from "../src/index.js";
import { makePlan, makeEntry } from "./fixture.js";

describe("makeEntryId", () => {
  const a = { seed: "resp-1", logId: "main", submittedAt: "2026-03-01T14:00:00Z" };
  it("is deterministic", () => expect(makeEntryId(a)).toBe(makeEntryId({ ...a })));
  it("changes with any input", () => {
    const ids = new Set([makeEntryId(a), makeEntryId({ ...a, seed: "resp-2" }), makeEntryId({ ...a, logId: "x" }), makeEntryId({ ...a, submittedAt: "2026-03-01T14:00:01Z" })]);
    expect(ids.size).toBe(4);
  });
  it("is formula-safe and fixed length", () => expect(makeEntryId(a)).toMatch(/^e_[0-9a-f]{32}$/));
});

describe("sanitizeCellValue", () => {
  it.each(["=HYPERLINK(\"http://example.com\")", "+SUM(A1)", "-2+3", "@cmd", "  =1+1", "\t=1", "\r=1"])("prefixes %j", (s) => {
    expect(sanitizeCellValue(s).startsWith("'")).toBe(true);
  });
  it("leaves normal text alone", () => {
    expect(sanitizeCellValue("Acme Corp")).toBe("Acme Corp");
    expect(sanitizeCellValue("a=b")).toBe("a=b");
    expect(sanitizeCellValue("- Other -")).toBe("'- Other -");
  });
  it("handles non-strings", () => {
    expect(sanitizeCellValue(-5)).toBe("-5");
    expect(sanitizeCellValue(NaN)).toBe("");
    expect(sanitizeCellValue(null)).toBe("");
    expect(sanitizeCellValue(["=x", "b"])).toBe("'=x, b");
    expect(sanitizeCellValue(true)).toBe("Yes");
  });
  it("strips control characters", () => expect(sanitizeCellValue("a\u0000b\u0007c")).toBe("abc"));
});

describe("normaliseValue", () => {
  const f = (type: string, extra = {}) => ({ key: "k", label: "L", type, required: false, ...extra }) as never;
  it("text trims", () => expect(normaliseValue(f("text"), "  hi ")).toEqual({ ok: true, value: "hi" }));
  it("required empty fails; optional empty is blank", () => {
    expect(normaliseValue(f("text", { required: true }), " ").ok).toBe(false);
    expect(normaliseValue(f("text"), undefined)).toEqual({ ok: true, value: "" });
    expect(normaliseValue(f("multi_choice", { options: ["A"] }), "")).toEqual({ ok: true, value: [] });
  });
  it("email lowercases and validates", () => {
    expect(normaliseValue(f("email"), " A@Example.COM ")).toEqual({ ok: true, value: "a@example.com" });
    expect(normaliseValue(f("email"), "nope").ok).toBe(false);
  });
  it("date accepts ISO and US forms, rejects impossible", () => {
    expect(normaliseValue(f("date"), "2026-03-01")).toEqual({ ok: true, value: "2026-03-01" });
    expect(normaliseValue(f("date"), "3/1/2026")).toEqual({ ok: true, value: "2026-03-01" });
    expect(normaliseValue(f("date"), "2026-02-30").ok).toBe(false);
    expect(normaliseValue(f("date"), "soon").ok).toBe(false);
  });
  it("choice maps case-insensitively to the canonical option", () => {
    const c = f("choice", { options: ["Email", "Call"] });
    expect(normaliseValue(c, "call")).toEqual({ ok: true, value: "Call" });
    expect(normaliseValue(c, "Fax").ok).toBe(false);
  });
  it("multi_choice takes arrays or comma lists, dedupes, rejects unknown", () => {
    const m = f("multi_choice", { options: ["Education", "Arts", "Mind, Body"] });
    expect(normaliseValue(m, "education, arts, ARTS")).toEqual({ ok: true, value: ["Education", "Arts"] });
    expect(normaliseValue(m, ["Arts"])).toEqual({ ok: true, value: ["Arts"] });
    expect(normaliseValue(m, "mind, body")).toEqual({ ok: true, value: ["Mind, Body"] });
    expect(normaliseValue(m, "Arts, Sports").ok).toBe(false);
  });
  it("yes_no", () => {
    expect(normaliseValue(f("yes_no"), "y")).toEqual({ ok: true, value: "Yes" });
    expect(normaliseValue(f("yes_no"), "FALSE")).toEqual({ ok: true, value: "No" });
    expect(normaliseValue(f("yes_no"), "maybe").ok).toBe(false);
  });
  it("number", () => {
    expect(normaliseValue(f("number"), "1,200.5")).toEqual({ ok: true, value: 1200.5 });
    expect(normaliseValue(f("number"), "abc").ok).toBe(false);
  });
  it("phone", () => {
    expect(normaliseValue(f("phone"), "(555) 123-4567").ok).toBe(true);
    expect(normaliseValue(f("phone"), "=1+1").ok).toBe(false);
    expect(normaliseValue(f("phone"), "123").ok).toBe(false);
  });
  it("url", () => {
    expect(normaliseValue(f("url"), "https://example.com/a").ok).toBe(true);
    expect(normaliseValue(f("url"), "javascript:alert(1)").ok).toBe(false);
    expect(normaliseValue(f("url"), "example.com").ok).toBe(false);
  });
});

describe("normaliseEntry and cells", () => {
  const plan = makePlan();
  it("normalises a full submission and drops unknown keys", () => {
    const r = normaliseEntry(plan, "main", { org_name: "Acme", interaction: "email", date: "3/1/2026", area: "Education, Arts", bogus: "x" });
    expect(r).toEqual({ ok: true, values: { org_name: "Acme", contact_email: "", interaction: "Email", date: "2026-03-01", area: ["Education", "Arts"], follow_up: "", notes: "" } });
  });
  it("collects all errors", () => {
    const r = normaliseEntry(plan, "main", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBe(4);
  });
  it("copy logs use the source fields", () => expect(normaliseEntry(plan, "education", { org_name: "A", interaction: "Call", date: "2026-03-01", area: "Arts" }).ok).toBe(true));
  it("builds headers and sanitised cells", () => {
    expect(headersForLog(plan, "education").slice(0, 4)).toEqual(["Entry ID", "Entered by", "Entered at", "Organization"]);
    const cells = entryToCells(plan, "main", makeEntry({ values: { org_name: "=EVIL()", area: ["Arts", "Education"] } }));
    expect(cells[3]).toBe("'=EVIL()");
    expect(cells[7]).toBe("Arts, Education");
    expect(cells.length).toBe(10);
  });
});
