import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPS, checkPlanRequest } from "../lib/caps";
import { readJsonBody } from "../lib/http";
import { checkRateLimit, hashVisitor, resetRateLimitMemory, type RemoteCounter } from "../lib/ratelimit";
import { FUNNEL_STEPS, recordEvent, sanitizeEvent } from "../lib/events";
import { emptyAnswers } from "../lib/questions";
import { SAMPLE_PERSONAS } from "../lib/planner/replay";

describe("input caps", () => {
  it("accepts 500 characters and rejects 501", () => {
    expect(checkPlanRequest({ answers: { q1_interaction_kinds: "a".repeat(500) } }).ok).toBe(true);
    const r = checkPlanRequest({ answers: { q1_interaction_kinds: "a".repeat(501) } });
    expect(r).toMatchObject({ ok: false });
  });

  it("enforces the total cap", () => {
    const answers = Object.fromEntries(Object.keys(emptyAnswers()).map((k) => [k, "a".repeat(500)]));
    expect(CAPS.maxTotalChars).toBeLessThan(5000);
    expect(checkPlanRequest({ answers })).toMatchObject({ ok: false });
  });

  it("rejects non-text answers and drops unknown keys", () => {
    expect(checkPlanRequest({ answers: { q1_interaction_kinds: 5 } }).ok).toBe(false);
    const r = checkPlanRequest({ answers: { evil: "x", q1_interaction_kinds: "ok" }, extra: 1 });
    expect(r.ok && Object.keys(r.value.answers)).not.toContain("evil");
    expect(checkPlanRequest("nope").ok).toBe(false);
  });

  it("caps the request body before parsing it", async () => {
    const huge = new Request("http://localhost/api/plan", { method: "POST", body: "{" + "x".repeat(CAPS.planBodyBytes * 2) });
    expect(await readJsonBody(huge, CAPS.planBodyBytes)).toMatchObject({ ok: false, status: 413 });
    const ok = new Request("http://localhost/api/plan", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(await readJsonBody(ok, CAPS.planBodyBytes)).toEqual({ ok: true, value: { a: 1 } });
    const bad = new Request("http://localhost/api/plan", { method: "POST", body: "{not json" });
    expect(await readJsonBody(bad, CAPS.planBodyBytes)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("rate limit", () => {
  beforeEach(() => resetRateLimitMemory());
  afterEach(() => vi.useRealTimers());

  it("blocks after the limit in memory and resets next window", async () => {
    const k = hashVisitor("203.0.113.5", "plan", { RATE_LIMIT_SALT: "s" });
    for (let i = 0; i < 3; i++) expect((await checkRateLimit({ keyHash: k, limit: 3, windowMs: 1000, now: 5000, remote: null })).allowed).toBe(true);
    const blocked = await checkRateLimit({ keyHash: k, limit: 3, windowMs: 1000, now: 5100, remote: null });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect((await checkRateLimit({ keyHash: k, limit: 3, windowMs: 1000, now: 6100, remote: null })).allowed).toBe(true);
  });

  it("never contains the raw IP and depends on the salt", () => {
    const a = hashVisitor("203.0.113.5", "plan", { RATE_LIMIT_SALT: "one" });
    const b = hashVisitor("203.0.113.5", "plan", { RATE_LIMIT_SALT: "two" });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203");
    expect(a).not.toBe(b);
  });

  it("fails open when the remote store throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const remote: RemoteCounter = { increment: async () => { throw new Error("db down"); } };
    expect((await checkRateLimit({ keyHash: "k1", limit: 5, windowMs: 1000, remote })).allowed).toBe(true);
  });

  it("fails open when the remote store hangs past 1.5 s", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const remote: RemoteCounter = { increment: () => new Promise(() => undefined) };
    const p = checkRateLimit({ keyHash: "k2", limit: 5, windowMs: 1000, remote });
    await vi.advanceTimersByTimeAsync(1600);
    expect((await p).allowed).toBe(true);
  });

  it("uses a shared count from the remote store when it answers", async () => {
    const remote: RemoteCounter = { increment: async () => 99 };
    expect(await checkRateLimit({ keyHash: "k3", limit: 5, windowMs: 1000, remote })).toMatchObject({ allowed: false, source: "supabase" });
  });

  it("uses memory only when Supabase env is unset", async () => {
    expect(await checkRateLimit({ keyHash: "k4", limit: 5, windowMs: 1000, env: {} })).toMatchObject({ allowed: true, source: "memory" });
  });
});

describe("funnel events", () => {
  const good = { session_id: "123e4567-e89b-42d3-a456-426614174000", step: "plan_validated", validation_result: "retry_pass", retry_count: 1, duration_ms: 1200, ai_mode: "replay" };

  it("uses exactly the 12 contract step names", () => {
    expect([...FUNNEL_STEPS]).toEqual([
      "interview_started", "interview_completed", "plan_requested", "plan_generated", "plan_validated", "preview_opened",
      "preview_edited", "plan_approved", "plan_downloaded", "build_started", "build_succeeded", "build_failed",
    ]);
  });

  it("keeps only contract columns and drops unknown fields", () => {
    const e = sanitizeEvent({ ...good, email: "a@example.com", plan: {}, ip: "1.2.3.4", api_key: "x" });
    expect(Object.keys(e!).sort()).toEqual(["ai_mode", "duration_ms", "retry_count", "session_id", "step", "validation_result"]);
  });

  it("rejects bad values", () => {
    expect(sanitizeEvent({ ...good, step: "other" })).toBeNull();
    expect(sanitizeEvent({ ...good, ai_mode: "live" })).toBeNull();
    expect(sanitizeEvent({ ...good, session_id: "not-a-uuid" })).toBeNull();
    expect(sanitizeEvent({ ...good, duration_ms: 86_400_001 })).toBeNull();
    expect(sanitizeEvent({ ...good, retry_count: 11 })).toBeNull();
    expect(sanitizeEvent({ ...good, validation_result: "maybe" })).toBeNull();
    expect(sanitizeEvent({ session_id: good.session_id, step: "interview_started", ai_mode: "byok" })).toMatchObject({ duration_ms: null, validation_result: null, retry_count: 0 });
  });

  it("is a no-op without Supabase env", async () => {
    expect(await recordEvent(sanitizeEvent(good)!, { env: {} })).toBe("skipped");
  });

  it("fails open when the insert throws or hangs", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await recordEvent(sanitizeEvent(good)!, { insert: async () => { throw new Error("paused"); } })).toBe("failed");
    expect(await recordEvent(sanitizeEvent(good)!, { insert: async () => undefined })).toBe("stored");
  });
});

describe("API routes with no environment", () => {
  beforeEach(() => {
    resetRateLimitMemory();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.AI_MODE;
  });
  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("POST /api/plan replays a sample", async () => {
    const { POST } = await import("../app/api/plan/route");
    const res = await POST(post("/api/plan", { answers: SAMPLE_PERSONAS[0]!.answers }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mode: "replay" });
  });

  it("POST /api/plan rejects an oversized body with 413 and a long answer with 400", async () => {
    const { POST } = await import("../app/api/plan/route");
    expect((await POST(post("/api/plan", "x".repeat(CAPS.planBodyBytes + 10)))).status).toBe(413);
    expect((await POST(post("/api/plan", { answers: { q1_interaction_kinds: "a".repeat(501) } }))).status).toBe(400);
  });

  it("POST /api/plan rate limits one visitor", async () => {
    const { POST } = await import("../app/api/plan/route");
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await POST(post("/api/plan", { answers: SAMPLE_PERSONAS[0]!.answers }, { "x-forwarded-for": "198.51.100.9" }))).status;
    expect(last).toBe(429);
  });

  it("POST /api/events is a no-op without Supabase and does not store", async () => {
    const { POST } = await import("../app/api/events/route");
    const res = await POST(post("/api/events", { session_id: "123e4567-e89b-42d3-a456-426614174000", step: "interview_started", ai_mode: "replay" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stored: false });
    expect((await POST(post("/api/events", { step: "bad" }))).status).toBe(400);
  });

  it("POST /api/validate returns a summary for a good plan and errors for a bad edit", async () => {
    const { POST } = await import("../app/api/validate/route");
    const plan = (await (await (await import("../app/api/plan/route")).POST(post("/api/plan", { answers: SAMPLE_PERSONAS[0]!.answers }))).json()).plan;
    const ok = await (await POST(post("/api/validate", { plan }))).json();
    expect(ok).toMatchObject({ ok: true });
    expect(ok.summary).toContain("I will create");
    plan.time_zone = "Mars/Base";
    const bad = await (await POST(post("/api/validate", { plan }))).json();
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
    expect((await POST(post("/api/validate", { nope: 1 }))).status).toBe(400);
  });
});
