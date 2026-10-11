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
export const MAX_MEMORY_KEYS = 5000;
// Used only when RATE_LIMIT_SALT is unset: hashes still never contain a raw IP.
const fallbackSalt = randomBytes(16).toString("hex");

export function resetRateLimitMemory(): void {
  memory.clear();
}

export function rateLimitMemorySize(): number {
  return memory.size;
}

/** Salted SHA-256 hex of the route and visitor IP. The raw IP is never stored or sent anywhere. */
export function hashVisitor(ip: string, route: string, env: Env = process.env): string {
  const salt = env.RATE_LIMIT_SALT || fallbackSalt;
  return createHash("sha256").update(`${salt}|${route}|${ip}`).digest("hex");
}

/** Key used when no usable client address header exists. Shared, so callers should apply a stricter limit. */
export const UNKNOWN_VISITOR = "unknown";

/**
 * The client address. Platform-set headers win. The first x-forwarded-for hop can be written by the
 * client, so when only x-forwarded-for exists the right-most entry (added by the nearest proxy) is used.
 */
export function visitorIp(headers: Headers): string {
  const platform = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  if (platform) return platform;
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops[hops.length - 1] || UNKNOWN_VISITOR;
}

/** Limit to use for a route: the stricter unknownLimit when the address could not be determined. */
export function limitFor(ip: string, limit: number, unknownLimit: number = Math.max(1, Math.floor(limit / 2))): number {
  return ip === UNKNOWN_VISITOR ? Math.min(limit, unknownLimit) : limit;
}

/** The slice of the Supabase client that is used. Injectable for tests. */
export type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

function supabaseCounter(env: Env): RemoteCounter | null {
  const sb = getSupabase(env);
  return sb ? counterFromClient(sb as unknown as RpcClient) : null;
}

export function counterFromClient(sb: RpcClient): RemoteCounter {
  return {
    // One atomic statement in Postgres. See supabase/migrations/20261011000200_increment_rate_limit.sql for the function.
    async increment(keyHash, windowStartIso) {
      const { data, error } = await sb.rpc("increment_rate_limit", { p_key_hash: keyHash, p_window_start: windowStartIso });
      if (error) throw new Error("rpc failed");
      const n = Number(data);
      if (!Number.isFinite(n)) throw new Error("rpc returned no count");
      return n;
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
    // Still full of current-window keys: drop the oldest-inserted first (Map keeps insertion order).
    for (const k of memory.keys()) {
      if (memory.size <= MAX_MEMORY_KEYS) break;
      memory.delete(k);
    }
  }
  const entry = memory.get(opts.keyHash);
  const count = entry && entry.windowStart === windowStart ? entry.count + 1 : 1;
  memory.delete(opts.keyHash); // re-insert so insertion order tracks recent use
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
