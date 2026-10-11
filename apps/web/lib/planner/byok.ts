// Bring-your-own-key mode. The visitor's key arrives in a request header, is used for exactly one
// planner call (plus at most one retry), and is never stored, logged, echoed, or put in an error.
import Anthropic from "@anthropic-ai/sdk";
import { PLANNER_PROMPT } from "../../data/planner-prompt";
import { redactSecrets } from "./redact";
import { PlannerError, type PlannerProvider, type ProviderRequest } from "./types";

export { BYOK_HEADER } from "./header";
export const DEFAULT_MODEL = "claude-sonnet-5-5";

type Env = Record<string, string | undefined>;

/** The slice of the SDK that is used. Injectable for tests. */
export type ReplyBlock = { type: string; text?: string; name?: string; input?: unknown };
export type MessagesClient = {
  messages: { create(params: Record<string, unknown>): Promise<{ content: ReplyBlock[] }> };
};
export type ClientFactory = (apiKey: string) => MessagesClient;

/**
 * Everything is passed explicitly so the SDK never falls back to ANTHROPIC_AUTH_TOKEN or
 * ANTHROPIC_BASE_URL from the environment. A visitor key must only ever go to api.anthropic.com.
 */
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export function clientOptions(apiKey: string) {
  return { apiKey, authToken: null, baseURL: ANTHROPIC_BASE_URL, maxRetries: 0, timeout: 90_000 } as const;
}
export const defaultClientFactory: ClientFactory = (apiKey) => new Anthropic(clientOptions(apiKey)) as unknown as MessagesClient;

export const PLAN_TOOL_NAME = "emit_plan";

/**
 * The planner reply envelope as a JSON Schema. The inside of `plan` is checked by the validator
 * (validatePlannerReply), not here, so it is only declared as an object or null.
 */
export const PLAN_TOOL = {
  name: PLAN_TOOL_NAME,
  description: "Return the planner reply: the plan (or null with follow-up questions), follow-up questions, and unsupported requests.",
  input_schema: {
    type: "object",
    properties: {
      plan: { type: ["object", "null"], description: "The full plan object, or null only when there is at least one follow-up question." },
      follow_up_questions: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 2 },
      unsupported_requests: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 20 },
    },
    required: ["plan", "follow_up_questions", "unsupported_requests"],
    additionalProperties: false,
  },
} as const;

/** Loose shape check only. The provider decides whether the key really works. */
export function looksLikeKey(key: string): boolean {
  return key.length >= 20 && key.length <= 300 && /^[\x21-\x7e]+$/.test(key);
}

export function userMessage({ input, validation_errors }: ProviderRequest): string {
  const payload: Record<string, unknown> = { ...input };
  if (validation_errors) payload.validation_errors = validation_errors;
  return JSON.stringify(payload);
}

/** Reads the forced tool call's input. Throws a friendly error when the reply has none. */
export function readToolInput(content: ReplyBlock[] | undefined): unknown {
  const block = (content ?? []).find((b) => b.type === "tool_use" && b.name === PLAN_TOOL_NAME);
  if (!block || typeof block.input !== "object" || block.input === null) {
    throw new PlannerError("provider_rejected", "The AI provider did not return a plan in the expected form. Try again.", 502);
  }
  return block.input;
}

function safeFailure(error: unknown, apiKey: string): PlannerError {
  const status = typeof (error as { status?: unknown })?.status === "number" ? ((error as { status: number }).status) : 0;
  // Never use error.message: it can contain request details. Map the status to fixed text instead.
  if (status === 401 || status === 403) return new PlannerError("bad_key", "The AI provider did not accept that key. Check it and try again.", 401);
  if (status === 429) return new PlannerError("provider_rate_limited", "The AI provider says your key is rate limited. Wait a moment and try again.", 429);
  if (status >= 400 && status < 500) return new PlannerError("provider_rejected", "The AI provider rejected the request.", 502);
  return new PlannerError("provider_unavailable", redactSecrets("The AI provider could not be reached. Try again later.", apiKey), 502);
}

export function createByokProvider(apiKey: string, opts: { env?: Env; clientFactory?: ClientFactory } = {}): PlannerProvider {
  if (!looksLikeKey(apiKey)) throw new PlannerError("bad_key", "That does not look like an API key.", 400);
  const model = (opts.env ?? {}).ANTHROPIC_MODEL || DEFAULT_MODEL;
  const client = (opts.clientFactory ?? defaultClientFactory)(apiKey);
  return {
    mode: "byok",
    async generate(req) {
      try {
        const res = await client.messages.create({
          model,
          max_tokens: 8192,
          system: PLANNER_PROMPT,
          messages: [{ role: "user", content: userMessage(req) }],
          tools: [PLAN_TOOL],
          tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
        });
        return readToolInput(res.content);
      } catch (error) {
        if (error instanceof PlannerError) throw error;
        throw safeFailure(error, apiKey);
      }
    },
  };
}
