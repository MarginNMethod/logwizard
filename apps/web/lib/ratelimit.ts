import { createHash, randomBytes } from "node:crypto";
import { getSupabase, withTimeout } from "./supabase";

type Env = Record<string, string | undefined>;

/** The remote counter (Supabase). Injectable so tests can simulate slow or failing storage. */
export interface RemoteCounter {
  /** Adds one to the count for (keyHash, windowStart) and returns the new count. */
  increment(keyHash: string, windowStartIso: string): Promise<number>;
}

export type RateLimitResult = { allowed: boolean; retryAfterSec: number; source: "memory" | "supabase" };

const memory = new Map<string, { windowStart: number; count: number }>();
const MAX_MEMORY_KEYS = 5000;
// Used only when RATE_LIMIT_SALT is unset: hashes still never contain a raw IP.
const fallbackSalt = randomBytes(16).toString("hex");

export function resetRateLimitMemory(): void {
  memory.clear();
}

/** Salted SHA-256 hex of the route and visitor IP. The raw IP is never stored or sent anywhere. */
export function hashVisitor(ip: string, route: string, env: Env = process.env): string {
  const salt = env.RATE_LIMIT_SALT || fallbackSalt;
  return createHash("sha256").update(`${salt}|${route}|${ip}`).digest("hex");
}

export function visitorIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "unknown";
}

function supabaseCounter(env: Env): RemoteCounter | null {
  const sb = getSupabase(env);
  if (!sb) return null;
  return {
    async increment(keyHash, windowStartIso) {
      const read = await sb.from("rate_limits").select("request_count").eq("key_hash", keyHash).eq("window_start", windowStartIso).maybeSingle();
      if (read.error) throw new Error("read failed");
      const next = ((read.data?.request_count as number | undefined) ?? 0) + 1;
      const write = await sb.from("rate_limits").upsert({ key_hash: keyHash, window_start: windowStartIso, request_count: next });
      if (write.error) throw new Error("write failed");
      return next;
    },
  };
}

/**
 * Per-visitor rate limit. The in-memory limit always applies (per server instance).
 * When Supabase is configured it adds a shared count; any failure or slowness (1.5 s) fails open.
 */
export async function checkRateLimit(opts: {
  keyHash: string;
  limit: number;
  windowMs: number;
  now?: number;
  env?: Env;
  remote?: RemoteCounter | null;
}): Promise<RateLimitResult> {
  const now = opts.now ?? Date.now();
  const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + opts.windowMs - now) / 1000));

  if (memory.size > MAX_MEMORY_KEYS) {
    for (const [k, v] of memory) if (v.windowStart < windowStart) memory.delete(k);
    if (memory.size > MAX_MEMORY_KEYS) memory.clear();
  }
  const entry = memory.get(opts.keyHash);
  const count = entry && entry.windowStart === windowStart ? entry.count + 1 : 1;
  memory.set(opts.keyHash, { windowStart, count });
  if (count > opts.limit) return { allowed: false, retryAfterSec, source: "memory" };

  const remote = opts.remote === undefined ? supabaseCounter(opts.env ?? process.env) : opts.remote;
  if (!remote) return { allowed: true, retryAfterSec, source: "memory" };
  try {
    const shared = await withTimeout(remote.increment(opts.keyHash, new Date(windowStart).toISOString()));
    if (shared > opts.limit) return { allowed: false, retryAfterSec, source: "supabase" };
  } catch {
    // Fail open. Generic line only, no payload.
    console.warn("rate limit store unavailable; using in-memory limit only");
  }
  return { allowed: true, retryAfterSec, source: "memory" };
}
