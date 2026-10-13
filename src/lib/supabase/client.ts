import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Without Supabase env vars the app runs in local "demo mode": no sign-in, all
 * data stays in IndexedDB. Handy for development and UI work.
 */
export const supabaseConfigured = Boolean(url && key);

let client: Promise<SupabaseClient> | null = null;

/**
 * Browser client, loaded lazily so supabase-js stays out of the first paint.
 * The session lives in localStorage so the app keeps working offline; data
 * access happens client-side under RLS, so no server cookies are needed. API
 * routes receive the access token as a Bearer header instead.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!supabaseConfigured) return Promise.reject(new Error("Supabase is not configured"));
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url!, key!, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return client;
}

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await (await getSupabase()).auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
