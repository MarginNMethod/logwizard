import { CAPS } from "@/lib/caps";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { checkRateLimit, hashVisitor, limitFor, visitorIp } from "@/lib/ratelimit";
import { validateEditedPlan } from "@/lib/validate-edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ip = visitorIp(req.headers);
  const rate = await checkRateLimit({ keyHash: hashVisitor(ip, "validate"), limit: limitFor(ip, 120), windowMs: 60_000 });
  if (!rate.allowed) return jsonResponse(429, { ok: false, errors: [{ path: "(request)", message: "Too many edits too fast. Wait a moment." }] });
  const body = await readJsonBody(req, CAPS.validateBodyBytes);
  if (!body.ok) return jsonResponse(body.status, { ok: false, errors: [{ path: "(request)", message: body.message }] });
  const out = validateEditedPlan(body.value);
  return jsonResponse(out.status, out.body);
}
