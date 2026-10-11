import { describe, it, expect } from "vitest";
import { planSends, DAILY_CAPS } from "../src/index.js";

const many = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@example.com`);

describe("planSends", () => {
  it("default caps", () => expect(DAILY_CAPS).toEqual({ personal: 100, workspace: 1500 }));
  it("sends everyone under the cap with no warning", () => {
    const r = planSends(many(10), 0, 100);
    expect(r.allowed).toHaveLength(10);
    expect(r.deferred).toEqual([]);
    expect(r.warn).toBe(false);
    expect(r.remaining).toBe(90);
    expect(r.message).toBeUndefined();
  });
  it("warns at exactly 80%", () => {
    const r = planSends(many(10), 70, 100);
    expect(r.usedAfter).toBe(80);
    expect(r.warn).toBe(true);
    expect(r.message).toMatch(/80%/);
  });
  it("does not warn at 79", () => expect(planSends(many(9), 70, 100).warn).toBe(false));
  it("never exceeds the cap and defers the rest", () => {
    const r = planSends(many(30), 90, 100);
    expect(r.allowed).toHaveLength(10);
    expect(r.deferred).toHaveLength(20);
    expect(r.usedAfter).toBe(100);
    expect(r.remaining).toBe(0);
    expect(r.message).toMatch(/limit reached/i);
  });
  it("sends nothing when already at or over the cap", () => {
    expect(planSends(many(3), 100, 100).allowed).toEqual([]);
    const over = planSends(many(3), 150, 100);
    expect(over.allowed).toEqual([]);
    expect(over.usedAfter).toBe(150);
    expect(over.deferred).toHaveLength(3);
  });
  it("dedupes recipients ignoring case", () => expect(planSends(["A@example.com", "a@example.com ", "b@example.com"], 0, 100).allowed).toEqual(["a@example.com", "b@example.com"]));
  it("zero or negative cap sends nothing", () => {
    expect(planSends(many(2), 0, 0).allowed).toEqual([]);
    expect(planSends(many(2), 0, -5).allowed).toEqual([]);
  });
  it("workspace cap", () => expect(planSends(many(1600), 0, DAILY_CAPS.workspace).allowed).toHaveLength(1500));
});
