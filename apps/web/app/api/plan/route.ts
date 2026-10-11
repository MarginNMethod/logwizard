import { CAPS } from "@/lib/caps";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { handlePlanRequest } from "@/lib/planner";
import { checkRateLimit, hashVisitor, visitorIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request): Promise<Response> {
  const rate = await checkRateLimit({ keyHash: hashVisitor(visitorIp(req.headers), "plan"), limit: LIMIT, windowMs: WINDOW_MS });
  if (!rate.allowed) {
    return jsonResponse(429, { ok: false, code: "rate_limited", message: "Too many requests. Please wait a few minutes and try again." }, { "retry-after": String(rate.retryAfterSec) });
  }
  const body = await readJsonBody(req, CAPS.planBodyBytes);
  if (!body.ok) return jsonResponse(body.status, { ok: false, code: "bad_input", message: body.message });

  const outcome = await handlePlanRequest(body.value, req.headers);
  return jsonResponse(outcome.ok ? 200 : outcome.status, outcome);
}
