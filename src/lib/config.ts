export interface PublicConfig {
  supabaseUrl: string | null;
  supabaseKey: string | null;
  gifSearchEnabled: boolean;
  /** Human-readable problems with the configuration (empty when OK). */
  problems: string[];
}

/**
 * Public defaults for the Daget Supabase project. These are the publishable
 * (browser) credentials — safe to ship; all access is guarded by RLS + RPC
 * checks in supabase/schema.sql. Env vars override them.
 */
const DEFAULT_SUPABASE_URL = "https://sfvysgdzqrgppbgyjmtk.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_z25U74JvH70dxDRyMNZjrw_O0ppXZ30";

function firstEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  let url = raw.replace(/^["']|["']$/g, "").trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, "").replace(/\/(rest|auth|storage|realtime)\/v1.*$/i, "");
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Resolved on the server at request time, so the app works with the variable
 * names used by Supabase's Vercel integration as well as our own. Only public
 * (anon / publishable) keys are ever read here — never the service role key.
 */
export function getPublicConfig(): PublicConfig {
  const rawUrl = firstEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL") ?? DEFAULT_SUPABASE_URL;
  const supabaseUrl = normalizeUrl(rawUrl);
  const supabaseKey = firstEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  )?.replace(/^["']|["']$/g, "") ?? DEFAULT_SUPABASE_KEY;

  const problems: string[] = [];
  if (!rawUrl) problems.push("NEXT_PUBLIC_SUPABASE_URL belum diisi.");
  else if (!supabaseUrl) problems.push("NEXT_PUBLIC_SUPABASE_URL tidak valid. Contoh: https://abcdefgh.supabase.co");
  if (!supabaseKey) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi.");
  else if (/service_role|^sb_secret_/.test(supabaseKey) || supabaseKey.includes("c2VydmljZV9yb2xl")) {
    problems.push("Key yang diisi adalah service_role / secret key. Gunakan anon / publishable key.");
  }

  return {
    supabaseUrl,
    supabaseKey: problems.length ? null : supabaseKey,
    gifSearchEnabled: Boolean(process.env.GIPHY_API_KEY),
    problems,
  };
}
