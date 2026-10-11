import { recordEvent, sanitizeEvent } from "@/lib/events";
import { CAPS } from "@/lib/caps";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { checkRateLimit, hashVisitor, visitorIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const rate = await checkRateLimit({ keyHash: hashVisitor(visitorIp(req.headers), "events"), limit: 120, windowMs: 60_000 });
  if (!rate.allowed) return jsonResponse(429, { ok: false });
  const body = await readJsonBody(req, CAPS.eventsBodyBytes);
  if (!body.ok) return jsonResponse(body.status, { ok: false });
  const event = sanitizeEvent(body.value);
  if (!event) return jsonResponse(400, { ok: false });
  // No-op without Supabase env; never fails the request.
  const result = await recordEvent(event);
  return jsonResponse(200, { ok: true, stored: result === "stored" });
}
