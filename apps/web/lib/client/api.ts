import type { Plan, PlanError } from "@logwizard/plan-schema";
import { BYOK_HEADER } from "../planner/header";
import type { Answers } from "../questions";

export type PlanResponse =
  | {
      ok: true;
      mode: "replay" | "byok" | "live";
      plan: Plan | null;
      summary: string | null;
      follow_up_questions: string[];
      unsupported_requests: string[];
      validation_result: "pass" | "retry_pass";
      retry_count: 0 | 1;
    }
  | { ok: false; code: string; message: string; errors?: PlanError[] };

export type ValidateResponse = { ok: true; plan: Plan; summary: string } | { ok: false; errors: PlanError[] };

const NETWORK_ERROR = { ok: false as const, code: "network", message: "Could not reach the server. Check your connection and try again." };

/** Friendly text for a reply that is not JSON (a proxy error page, a 413 from the host, a crash). */
export function friendlyStatusMessage(status: number): string {
  if (status === 413) return "That request was too large. Shorten your answers and try again.";
  if (status === 429) return "Too many requests. Please wait a few minutes and try again.";
  if (status >= 500) return "The server had a problem. Please try again in a moment.";
  return "The server sent a reply this page could not read. Please try again.";
}

/** Reads a JSON body only when the server says it is JSON. Otherwise returns null. */
export async function readJsonReply(res: Response): Promise<unknown | null> {
  if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Header values must be printable ASCII without spaces. Checked before sending so fetch cannot throw. */
export function isValidKeyFormat(key: string): boolean {
  return /^[\x21-\x7e]+$/.test(key);
}

export const BAD_KEY_FORMAT_MESSAGE = "That key has characters a key cannot have (spaces, line breaks, or non-English characters). Paste it again.";

/** The key goes in a header for this one request. It is not stored anywhere in the browser. */
export async function requestPlan(args: {
  answers: Answers;
  browserTimeZone?: string;
  apiKey?: string;
  followUps?: Record<string, string>;
  followUpsUsed?: number;
}): Promise<PlanResponse> {
  if (args.apiKey && !isValidKeyFormat(args.apiKey)) return { ok: false, code: "bad_key", message: BAD_KEY_FORMAT_MESSAGE };
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json", ...(args.apiKey ? { [BYOK_HEADER]: args.apiKey } : {}) },
      body: JSON.stringify({
        answers: args.answers,
        browser_time_zone: args.browserTimeZone,
        follow_up_answers: args.followUps,
        follow_ups_used: args.followUpsUsed,
      }),
    });
    const body = await readJsonReply(res);
    if (body === null || typeof body !== "object" || !("ok" in body)) {
      return { ok: false, code: "bad_reply", message: friendlyStatusMessage(res.status) };
    }
    return body as PlanResponse;
  } catch {
    return NETWORK_ERROR;
  }
}

export async function requestValidate(plan: Plan): Promise<ValidateResponse> {
  try {
    const res = await fetch("/api/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const body = await readJsonReply(res);
    if (body === null || typeof body !== "object" || !("ok" in body)) {
      return { ok: false, errors: [{ path: "(request)", message: friendlyStatusMessage(res.status) }] };
    }
    return body as ValidateResponse;
  } catch {
    return { ok: false, errors: [{ path: "(request)", message: NETWORK_ERROR.message }] };
  }
}
