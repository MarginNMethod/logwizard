import { afterEach, describe, expect, it, vi } from "vitest";
import { validatePlan, validatePlannerReply } from "@logwizard/plan-schema";
import { createByokProvider, type ClientFactory } from "../lib/planner/byok";
import { getLiveProvider, isLiveEnabled } from "../lib/planner/live";
import { handlePlanRequest, runPlanner, selectProvider } from "../lib/planner";
import { createReplayProvider, SAMPLE_PERSONAS } from "../lib/planner/replay";
import { PlannerError } from "../lib/planner/types";
import { BYOK_HEADER } from "../lib/planner/header";

const KEY = "sk-ant-test-0123456789abcdefSECRET";
const career = SAMPLE_PERSONAS.find((p) => p.id === "career-center")!;
const goodReply = async () => {
  const provider = createReplayProvider(career.answers);
  return provider.generate({ input: { answers: career.answers } });
};

afterEach(() => vi.restoreAllMocks());

describe("replay mode", () => {
  it("has the sample personas, with answers and title only", () => {
    expect(SAMPLE_PERSONAS.length).toBeGreaterThanOrEqual(10);
    for (const p of SAMPLE_PERSONAS) expect(Object.keys(p).sort()).toEqual(["answers", "id", "title"]);
  });

  it("serves a recorded plan that passes validatePlan for every persona", async () => {
    for (const p of SAMPLE_PERSONAS) {
      const out = await handlePlanRequest({ answers: p.answers }, new Headers(), {});
      expect(out.ok, p.id).toBe(true);
      if (out.ok) {
        expect(out.mode).toBe("replay");
        expect(out.plan).not.toBeNull();
        expect(validatePlan(out.plan).ok, p.id).toBe(true);
        expect(out.summary).toContain("I will create");
      }
    }
  });

  it("refuses answers that match no sample", async () => {
    const out = await handlePlanRequest({ answers: { ...career.answers, q2_system_name: "Something else" } }, new Headers(), {});
    expect(out).toMatchObject({ ok: false, code: "replay_no_match", status: 422 });
  });

  it("runs with no environment variables at all", async () => {
    const out = await handlePlanRequest({ answers: career.answers }, new Headers(), {});
    expect(out.ok).toBe(true);
  });
});

describe("byok mode", () => {
  const factoryFor = (create: (p: Record<string, unknown>) => Promise<unknown>): ClientFactory => () => ({ messages: { create } }) as never;
  type Params = Record<string, unknown>;

  it("sends the key to the SDK only, uses ANTHROPIC_MODEL, and returns a validated plan", async () => {
    const reply = await goodReply();
    const seen: Record<string, unknown>[] = [];
    const factory: ClientFactory = (apiKey) => {
      expect(apiKey).toBe(KEY);
      return { messages: { create: async (p: Params) => (seen.push(p), { content: [{ type: "text", text: JSON.stringify(reply) }] }) } } as never;
    };
    const out = await handlePlanRequest({ answers: career.answers }, new Headers({ [BYOK_HEADER]: KEY }), { ANTHROPIC_MODEL: "test-model" }, factory);
    expect(out).toMatchObject({ ok: true, mode: "byok", validation_result: "pass", retry_count: 0 });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.model).toBe("test-model");
    expect(JSON.stringify(seen[0])).not.toContain(KEY);
  });

  it("defaults the model to claude-sonnet-5-5", async () => {
    const seen: Record<string, unknown>[] = [];
    const p = createByokProvider(KEY, { env: {}, clientFactory: factoryFor(async (x) => (seen.push(x), { content: [{ type: "text", text: "{}" }] })) });
    await p.generate({ input: { answers: career.answers } });
    expect(seen[0]?.model).toBe("claude-sonnet-5-5");
  });

  it("retries once with the validator error list, then succeeds", async () => {
    const good = await goodReply();
    const calls: string[] = [];
    const factory = factoryFor(async (p) => {
      const content = (p.messages as Array<{ content: string }>)[0]!.content;
      calls.push(content);
      return { content: [{ type: "text", text: calls.length === 1 ? '{"plan":{"schema_version":1},"follow_up_questions":[],"unsupported_requests":[]}' : JSON.stringify(good) }] };
    });
    const out = await runPlanner(createByokProvider(KEY, { clientFactory: factory }), { answers: career.answers });
    expect(out).toMatchObject({ ok: true, validation_result: "retry_pass", retry_count: 1 });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1]!).validation_errors.length).toBeGreaterThan(0);
  });

  it("gives up after one retry with a friendly error", async () => {
    const factory = factoryFor(async () => ({ content: [{ type: "text", text: "not json" }] }));
    const out = await runPlanner(createByokProvider(KEY, { clientFactory: factory }), { answers: career.answers });
    expect(out).toMatchObject({ ok: false, code: "invalid_plan", status: 422 });
  });

  it("never leaks the key in logs, errors, or responses, even when the SDK error contains it", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const boom = Object.assign(new Error(`401 invalid x-api-key ${KEY}`), { status: 401 });
    const out = await handlePlanRequest({ answers: career.answers }, new Headers({ [BYOK_HEADER]: KEY }), {}, factoryFor(async () => { throw boom; }));
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).not.toContain(KEY);
    expect(JSON.stringify(out)).not.toContain("SECRET");

    for (const status of [429, 400, 500, 0]) {
      const o = await handlePlanRequest({ answers: career.answers }, new Headers({ [BYOK_HEADER]: KEY }), {}, factoryFor(async () => { throw Object.assign(new Error(`failed ${KEY}`), { status }); }));
      expect(JSON.stringify(o)).not.toContain(KEY);
    }
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(KEY);
  });

  it("rejects things that are not keys without echoing them", async () => {
    const out = await handlePlanRequest({ answers: career.answers }, new Headers({ [BYOK_HEADER]: "short" }), {});
    expect(out).toMatchObject({ ok: false, code: "bad_key" });
    expect(JSON.stringify(out)).not.toContain("short");
  });
});

describe("live mode", () => {
  it("is unreachable in the default config", () => {
    expect(isLiveEnabled({})).toBe(false);
    expect(() => getLiveProvider({})).toThrow("live mode is not enabled");
    expect(() => getLiveProvider({ AI_MODE: "live" })).toThrow("live mode is not enabled");
    expect(() => getLiveProvider({ ANTHROPIC_API_KEY: KEY })).toThrow("live mode is not enabled");
    expect(() => getLiveProvider({ AI_MODE: "replay", ANTHROPIC_API_KEY: KEY })).toThrow(PlannerError);
  });

  it("is never selected without AI_MODE=live, even if a server key exists", () => {
    const p = selectProvider(new Headers(), { answers: career.answers }, { ANTHROPIC_API_KEY: KEY });
    expect(p.mode).toBe("replay");
  });

  it("returns a 503 outcome when AI_MODE=live has no key", async () => {
    const out = await handlePlanRequest({ answers: career.answers }, new Headers(), { AI_MODE: "live" });
    expect(out).toMatchObject({ ok: false, status: 503, message: "live mode is not enabled" });
  });
});

describe("planner reply handling", () => {
  it("returns follow-up questions when the plan is null", async () => {
    const provider = { mode: "replay" as const, generate: async () => ({ plan: null, follow_up_questions: ["Which area?"], unsupported_requests: [] }) };
    const out = await runPlanner(provider, { answers: career.answers });
    expect(out).toMatchObject({ ok: true, plan: null, summary: null, follow_up_questions: ["Which area?"] });
    expect(validatePlannerReply({ plan: null, follow_up_questions: [], unsupported_requests: [] }).ok).toBe(false);
  });
});
