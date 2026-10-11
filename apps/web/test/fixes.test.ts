import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPlanRequest } from "../lib/caps";
import { acceptInOrder, resetEventSessions, sanitizeEvent } from "../lib/events";
import { BAD_KEY_FORMAT_MESSAGE, friendlyStatusMessage, isValidKeyFormat, requestPlan, requestValidate } from "../lib/client/api";
import { createByokProvider, defaultClientFactory, PLAN_TOOL, type ClientFactory } from "../lib/planner/byok";
import { handlePlanRequest } from "../lib/planner";
import { findRecording, SAMPLE_PERSONAS } from "../lib/planner/replay";
import {
  checkRateLimit,
  counterFromClient,
  hashVisitor,
  limitFor,
  MAX_MEMORY_KEYS,
  rateLimitMemorySize,
  resetRateLimitMemory,
  UNKNOWN_VISITOR,
  visitorIp,
} from "../lib/ratelimit";
import { BYOK_HEADER } from "../lib/planner/header";
import { emptyAnswers } from "../lib/questions";
import { editedSample, parseDaysBefore, withBrowserTimeZone } from "../lib/wizard-logic";

const KEY = "sk-ant-test-0123456789abcdefSECRET";
const career = SAMPLE_PERSONAS.find((p) => p.id === "career-center")!;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("W1 client never reads the SDK environment", () => {
  it("uses only the visitor key and api.anthropic.com even when the env sets other values", () => {
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "env-token-should-not-be-used");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://evil.example.com");
    const client = defaultClientFactory(KEY) as unknown as {
      baseURL: string;
      authToken: string | null;
      maxRetries: number;
      timeout: number;
      authHeaders(o: unknown): Record<string, string>;
    };
    expect(client.baseURL).toBe("https://api.anthropic.com");
    expect(client.authToken).toBeNull();
    expect(client.maxRetries).toBe(0);
    expect(client.timeout).toBe(90_000);
    const headers = client.authHeaders({});
    expect(JSON.stringify(headers)).toContain(KEY);
    expect(JSON.stringify(headers)).not.toContain("env-token-should-not-be-used");
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("authorization");
  });
});

describe("W2 every sample persona replays when picked and untouched", () => {
  it("matches a recording through the same path the Wizard uses", async () => {
    for (const p of SAMPLE_PERSONAS) {
      // Wizard: choosePersona copies the answers, begin() applies withBrowserTimeZone, then the request is JSON.
      const answers = withBrowserTimeZone({ ...p.answers }, true, "America/Denver");
      expect(editedSample(answers, p.answers), p.id).toBe(false);
      const wire = JSON.parse(JSON.stringify({ answers, browser_time_zone: "America/Denver" }));
      const checked = checkPlanRequest(wire);
      expect(checked.ok, p.id).toBe(true);
      if (checked.ok) expect(findRecording(checked.value.answers)?.persona_id, p.id).toBe(p.id);
      const out = await handlePlanRequest(wire, new Headers(), {});
      expect(out.ok, p.id).toBe(true);
    }
  });

  it("keeps the vague-user empty time zone but still prefills when no sample is chosen", () => {
    const vague = SAMPLE_PERSONAS.find((p) => p.id === "vague-user")!;
    expect(withBrowserTimeZone(vague.answers, true, "America/Denver").q10_time_zone).toBe("");
    expect(withBrowserTimeZone(emptyAnswers(), false, "America/Denver").q10_time_zone).toBe("America/Denver");
    expect(withBrowserTimeZone({ ...emptyAnswers(), q10_time_zone: "Pacific" }, false, "America/Denver").q10_time_zone).toBe("Pacific");
  });

  it("flags an edit only when an answer really changed", () => {
    expect(editedSample(career.answers, career.answers)).toBe(false);
    expect(editedSample({ ...career.answers, q2_system_name: ` ${career.answers.q2_system_name} ` }, career.answers)).toBe(false);
    expect(editedSample({ ...career.answers, q2_system_name: "Other" }, career.answers)).toBe(true);
    expect(editedSample(career.answers, undefined)).toBe(false);
  });
});

describe("W3 rate limit key and eviction", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("prefers platform headers over x-forwarded-for", () => {
    expect(visitorIp(h({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 198.51.100.1" }))).toBe("203.0.113.7");
    expect(visitorIp(h({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "6.6.6.6" }))).toBe("203.0.113.8");
  });
  it("uses the right-most x-forwarded-for entry, never the spoofable first", () => {
    expect(visitorIp(h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 198.51.100.1" }))).toBe("198.51.100.1");
  });
  it("falls back to a coarse key with a stricter limit when no header exists", () => {
    expect(visitorIp(h({}))).toBe(UNKNOWN_VISITOR);
    expect(limitFor(UNKNOWN_VISITOR, 10)).toBeLessThan(10);
    expect(limitFor("203.0.113.7", 10)).toBe(10);
  });
  it("evicts the oldest keys first instead of clearing everything", async () => {
    resetRateLimitMemory();
    for (let i = 0; i <= MAX_MEMORY_KEYS + 5; i++) await checkRateLimit({ keyHash: `k${i}`, limit: 5, windowMs: 60_000, now: 1000, remote: null });
    expect(rateLimitMemorySize()).toBeLessThanOrEqual(MAX_MEMORY_KEYS + 1);
    expect(rateLimitMemorySize()).toBeGreaterThan(MAX_MEMORY_KEYS - 10);
    // The newest key kept its count; the oldest was evicted and starts fresh.
    for (let n = 0; n < 5; n++) await checkRateLimit({ keyHash: "newest", limit: 5, windowMs: 60_000, now: 1000, remote: null });
    expect((await checkRateLimit({ keyHash: "newest", limit: 5, windowMs: 60_000, now: 1000, remote: null })).allowed).toBe(false);
    expect((await checkRateLimit({ keyHash: "k0", limit: 1, windowMs: 60_000, now: 1000, remote: null })).allowed).toBe(true);
  });
  it("applies the stricter limit on a route with no address headers", async () => {
    resetRateLimitMemory();
    const { POST } = await import("../app/api/plan/route");
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await POST(new Request("http://localhost/api/plan", { method: "POST", body: JSON.stringify({ answers: career.answers }) }))).status;
    expect(last).toBe(429);
  });
});

describe("W4 atomic Supabase counter", () => {
  it("calls the increment_rate_limit RPC and returns its count", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const counter = counterFromClient({ rpc: async (fn, args) => (calls.push([fn, args]), { data: 7, error: null }) });
    expect(await counter.increment("hash", "2026-10-11T00:00:00.000Z")).toBe(7);
    expect(calls).toEqual([["increment_rate_limit", { p_key_hash: "hash", p_window_start: "2026-10-11T00:00:00.000Z" }]]);
  });
  it("throws on an RPC error or a non-numeric result so the limiter fails open", async () => {
    await expect(counterFromClient({ rpc: async () => ({ data: null, error: { message: "boom" } }) }).increment("h", "t")).rejects.toThrow();
    await expect(counterFromClient({ rpc: async () => ({ data: "x", error: null }) }).increment("h", "t")).rejects.toThrow();
  });
  it("keeps the in-memory limit as the first gate", async () => {
    resetRateLimitMemory();
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    const remote = counterFromClient({ rpc });
    for (let i = 0; i < 2; i++) await checkRateLimit({ keyHash: "gate", limit: 2, windowMs: 60_000, now: 1000, remote });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect((await checkRateLimit({ keyHash: "gate", limit: 2, windowMs: 60_000, now: 1000, remote })).source).toBe("memory");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("blocks when the shared count is over the limit", async () => {
    resetRateLimitMemory();
    const remote = counterFromClient({ rpc: async () => ({ data: 50, error: null }) });
    expect(await checkRateLimit({ keyHash: hashVisitor("1.2.3.4", "x", { RATE_LIMIT_SALT: "s" }), limit: 5, windowMs: 1000, remote })).toMatchObject({ allowed: false, source: "supabase" });
  });
});

describe("W5 BYOK structured output", () => {
  const replyOf = async () => (await import("../lib/planner/replay")).createReplayProvider(career.answers).generate({ input: { answers: career.answers } });

  it("forces the emit_plan tool and reads its input", async () => {
    const reply = await replyOf();
    const seen: Array<Record<string, unknown>> = [];
    const factory: ClientFactory = () => ({ messages: { create: async (p) => (seen.push(p), { content: [{ type: "tool_use", name: "emit_plan", input: reply }] }) } });
    const out = await createByokProvider(KEY, { clientFactory: factory }).generate({ input: { answers: career.answers } });
    expect(out).toEqual(reply);
    expect(seen[0]?.tool_choice).toEqual({ type: "tool", name: "emit_plan" });
    expect(seen[0]?.tools).toEqual([PLAN_TOOL]);
  });

  it("declares the reply envelope as the tool input schema", () => {
    expect(PLAN_TOOL.name).toBe("emit_plan");
    expect(PLAN_TOOL.input_schema.required).toEqual(["plan", "follow_up_questions", "unsupported_requests"]);
    expect(Object.keys(PLAN_TOOL.input_schema.properties).sort()).toEqual(["follow_up_questions", "plan", "unsupported_requests"]);
    expect(PLAN_TOOL.input_schema.properties.follow_up_questions.maxItems).toBe(2);
  });

  it("gives a clear error when the reply has no tool_use block", async () => {
    const factory: ClientFactory = () => ({ messages: { create: async () => ({ content: [{ type: "text", text: "{\"plan\":null}" }] }) } });
    const out = await handlePlanRequest({ answers: career.answers }, new Headers({ [BYOK_HEADER]: KEY }), {}, factory);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.message).toContain("did not return a plan");
      expect(JSON.stringify(out)).not.toContain(KEY);
    }
  });
});

describe("W6 security headers", () => {
  it("sets the CSP and the other headers for every path", async () => {
    const config = (await import(/* @vite-ignore */ "../next.config.mjs" as string)).default as { headers(): Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };
    const rules = await config.headers();
    expect(rules[0]?.source).toBe("/:path*");
    const map = Object.fromEntries(rules[0]!.headers.map((x) => [x.key, x.value]));
    const csp = map["Content-Security-Policy"]!;
    for (const part of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'"]) expect(csp).toContain(part);
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Referrer-Policy"]).toBe("no-referrer");
    expect(map["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });
});

describe("W7 event order and rate", () => {
  const sid = "123e4567-e89b-42d3-a456-426614174000";
  const ev = (step: string, session = sid) => sanitizeEvent({ session_id: session, step, ai_mode: "replay" })!;
  beforeEach(() => resetEventSessions());

  it("drops build_succeeded without plan_approved and accepts the real order", () => {
    expect(acceptInOrder(ev("build_succeeded"))).toBe(false);
    expect(acceptInOrder(ev("plan_approved"))).toBe(false);
    for (const s of ["interview_started", "interview_completed", "plan_requested", "plan_generated", "plan_validated", "preview_opened", "preview_edited", "plan_approved", "plan_downloaded", "build_started", "build_succeeded"]) {
      expect(acceptInOrder(ev(s)), s).toBe(true);
    }
  });

  it("the route acknowledges but does not store an impossible event, and limits to 30 per minute", async () => {
    resetRateLimitMemory();
    const { POST } = await import("../app/api/events/route");
    const post = (step: string) => POST(new Request("http://localhost/api/events", { method: "POST", headers: { "x-real-ip": "203.0.113.50" }, body: JSON.stringify({ session_id: sid, step, ai_mode: "replay" }) }));
    expect(await (await post("build_succeeded")).json()).toEqual({ ok: true, stored: false });
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await post("interview_started")).status;
    expect(last).toBe(429);
  });
});

describe("W8 client error handling", () => {
  const stubFetch = (res: Response | (() => never)) => {
    const f = vi.fn(async () => (typeof res === "function" ? res() : res));
    vi.stubGlobal("fetch", f);
    return f;
  };
  afterEach(() => vi.unstubAllGlobals());

  it("maps non-JSON replies by status instead of throwing", async () => {
    stubFetch(new Response("<html>Request Entity Too Large</html>", { status: 413, headers: { "content-type": "text/html" } }));
    expect(await requestPlan({ answers: career.answers })).toMatchObject({ ok: false, message: friendlyStatusMessage(413) });
    stubFetch(new Response("Internal Server Error", { status: 500 }));
    expect(await requestPlan({ answers: career.answers })).toMatchObject({ ok: false, message: friendlyStatusMessage(500) });
    stubFetch(new Response("oops", { status: 500, headers: { "content-type": "text/plain" } }));
    expect(await requestValidate({} as never)).toMatchObject({ ok: false, errors: [{ message: friendlyStatusMessage(500) }] });
    expect(friendlyStatusMessage(413)).not.toBe(friendlyStatusMessage(500));
  });

  it("passes a JSON reply through, even with an error status", async () => {
    stubFetch(new Response(JSON.stringify({ ok: false, code: "rate_limited", message: "Slow down" }), { status: 429, headers: { "content-type": "application/json; charset=utf-8" } }));
    expect(await requestPlan({ answers: career.answers })).toMatchObject({ ok: false, message: "Slow down" });
  });

  it("rejects a malformed pasted key before sending anything", async () => {
    const f = stubFetch(new Response("{}"));
    for (const bad of ["sk ant key", "key\nwith newline", "kéy-with-accent-0123456789"]) {
      expect(isValidKeyFormat(bad)).toBe(false);
      expect(await requestPlan({ answers: career.answers, apiKey: bad })).toMatchObject({ ok: false, message: BAD_KEY_FORMAT_MESSAGE });
    }
    expect(f).not.toHaveBeenCalled();
    expect(isValidKeyFormat(KEY)).toBe(true);
  });

  it("does not echo the bad key in its message", async () => {
    const out = await requestPlan({ answers: career.answers, apiKey: "bad key SECRET" });
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });
});

describe("W9 days before", () => {
  it("never turns an empty box into 0", () => {
    expect(parseDaysBefore("")).toBeNull();
    expect(parseDaysBefore("  ")).toBeNull();
    expect(parseDaysBefore("abc")).toBeNull();
    expect(parseDaysBefore("0")).toBe(0);
    expect(parseDaysBefore("3")).toBe(3);
  });

  it("makes the validator report a null days_before", async () => {
    const { POST } = await import("../app/api/validate/route");
    const owner = SAMPLE_PERSONAS.map((p) => p.id);
    let plan: { reminders: Array<{ type: string; days_before?: number | null }> } | null = null;
    for (const id of owner) {
      const persona = SAMPLE_PERSONAS.find((p) => p.id === id)!;
      const out = await handlePlanRequest({ answers: persona.answers }, new Headers(), {});
      if (out.ok && out.plan?.reminders.some((r) => r.type === "follow_up_due")) {
        plan = structuredClone(out.plan) as never;
        break;
      }
    }
    expect(plan).not.toBeNull();
    plan!.reminders.find((r) => r.type === "follow_up_due")!.days_before = null;
    resetRateLimitMemory();
    const res = await POST(new Request("http://localhost/api/validate", { method: "POST", headers: { "x-real-ip": "203.0.113.60" }, body: JSON.stringify({ plan }) }));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body.errors)).toContain("days_before");
  });
});
