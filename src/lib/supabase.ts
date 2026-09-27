import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let url: string | null = null;
let key: string | null = null;
let client: SupabaseClient | null = null;

/** Called once with the config resolved on the server. */
export function configureSupabase(nextUrl: string, nextKey: string) {
  if (url === nextUrl && key === nextKey) return;
  url = nextUrl;
  key = nextKey;
  client = null;
}

export function getSupabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase belum dikonfigurasi.");
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}
