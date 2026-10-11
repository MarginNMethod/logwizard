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
export type MessagesClient = {
  messages: { create(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string }> }> };
};
export type ClientFactory = (apiKey: string) => MessagesClient;

export const defaultClientFactory: ClientFactory = (apiKey) =>
  new Anthropic({ apiKey, maxRetries: 0, timeout: 90_000 }) as unknown as MessagesClient;

/** Loose shape check only. The provider decides whether the key really works. */
export function looksLikeKey(key: string): boolean {
  return key.length >= 20 && key.length <= 300 && /^[\x21-\x7e]+$/.test(key);
}

export function userMessage({ input, validation_errors }: ProviderRequest): string {
  const payload: Record<string, unknown> = { ...input };
  if (validation_errors) payload.validation_errors = validation_errors;
  return JSON.stringify(payload);
}

/** Pulls the JSON object out of the model's text. Returns null when there is none. */
export function parseReplyText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
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
  const model = (opts.env ?? process.env).ANTHROPIC_MODEL || DEFAULT_MODEL;
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
        });
        const text = res.content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");
        return parseReplyText(text);
      } catch (error) {
        throw safeFailure(error, apiKey);
      }
    },
  };
}
