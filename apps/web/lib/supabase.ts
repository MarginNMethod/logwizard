import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_TIMEOUT_MS = 1500;

type Env = Record<string, string | undefined>;

let cached: { key: string; client: SupabaseClient } | null = null;

/** Returns a server-side client, or null when the URL or service key is unset (the default). */
export function getSupabase(env: Env = process.env): SupabaseClient | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const id = `${url}|${key}`;
  if (cached?.key === id) return cached.client;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS) }) },
  });
  cached = { key: id, client };
  return client;
}

/** Resolves to the value, or rejects after ms. Used so metrics can never stall a request. */
export function withTimeout<T>(p: Promise<T>, ms: number = SUPABASE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
