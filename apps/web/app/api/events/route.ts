import { acceptInOrder, recordEvent, sanitizeEvent } from "@/lib/events";
import { CAPS } from "@/lib/caps";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { checkRateLimit, hashVisitor, limitFor, visitorIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS_PER_MINUTE = 30;

export async function POST(req: Request): Promise<Response> {
  const ip = visitorIp(req.headers);
  const rate = await checkRateLimit({ keyHash: hashVisitor(ip, "events"), limit: limitFor(ip, EVENTS_PER_MINUTE), windowMs: 60_000 });
  if (!rate.allowed) return jsonResponse(429, { ok: false });
  const body = await readJsonBody(req, CAPS.eventsBodyBytes);
  if (!body.ok) return jsonResponse(body.status, { ok: false });
  const event = sanitizeEvent(body.value);
  if (!event) return jsonResponse(400, { ok: false });
  // Impossible step orders are dropped (acknowledged, not stored). Metrics can still be polluted.
  if (!acceptInOrder(event)) return jsonResponse(200, { ok: true, stored: false });
  // No-op without Supabase env; never fails the request.
  const result = await recordEvent(event);
  return jsonResponse(200, { ok: true, stored: result === "stored" });
}
