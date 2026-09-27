// Supabase Edge Function: discord-verify
// Dipanggil browser tepat setelah login Discord. Mengecek ke Discord apakah user
// adalah anggota server (dan opsional punya role tertentu), lalu membuat/memperbarui
// profilnya di public.users. Hanya profil terverifikasi yang boleh mengirim pesan.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function cleanName(raw: string): string {
  // Buang karakter kontrol, rapikan spasi, batasi 32 karakter.
  const name = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return Array.from(name).slice(0, 32).join("") || "Anggota";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ ok: false, reason: "not_signed_in" }, 401);

  let providerToken = "";
  try {
    providerToken = String((await req.json())?.provider_token ?? "");
  } catch {
    /* empty body */
  }
  if (!providerToken) return json({ ok: false, reason: "reauth_required" });

  const identity = user.identities?.find((i) => i.provider === "discord");
  const discordId = String(identity?.identity_data?.provider_id ?? identity?.identity_data?.sub ?? identity?.id ?? "");
  if (!identity || !discordId) return json({ ok: false, reason: "not_discord" });

  const { data: settings } = await admin
    .from("app_settings")
    .select("discord_guild_id, discord_role_id, discord_guild_name, discord_invite_url")
    .eq("id", 1)
    .single();
  const guildId = settings?.discord_guild_id;
  if (!guildId) return json({ ok: false, reason: "guild_not_configured" });

  const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  if (res.status === 401) return json({ ok: false, reason: "reauth_required" });
  if (res.status === 429) return json({ ok: false, reason: "rate_limited" });
  if (res.status === 404 || res.status === 403) {
    return json({ ok: false, reason: "not_member", guild: settings?.discord_guild_name, invite: settings?.discord_invite_url });
  }
  if (!res.ok) return json({ ok: false, reason: "discord_error", status: res.status });

  const member = await res.json();
  // Token harus milik akun Discord yang sama dengan yang login.
  if (String(member?.user?.id) !== discordId) return json({ ok: false, reason: "reauth_required" });

  const roleId = settings?.discord_role_id;
  if (roleId && !(member.roles ?? []).includes(roleId)) {
    return json({ ok: false, reason: "missing_role", guild: settings?.discord_guild_name, invite: settings?.discord_invite_url });
  }

  const avatarUrl = member.avatar
    ? `https://cdn.discordapp.com/guilds/${guildId}/users/${discordId}/avatars/${member.avatar}.png?size=128`
    : member.user.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${member.user.avatar}.png?size=128`
      : null;

  const profile = {
    auth_id: user.id,
    discord_id: discordId,
    discord_username: String(member.user.username ?? ""),
    username: cleanName(member.nick || member.user.global_name || member.user.username || "Anggota"),
    avatar_url: avatarUrl,
    verified_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  };

  // Satu akun Discord = satu profil, walaupun akun login Supabase-nya dibuat ulang.
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .or(`auth_id.eq.${user.id},discord_id.eq.${discordId}`)
    .limit(1)
    .maybeSingle();
  const columns = "id, username, avatar_url, discord_username, is_admin, banned";
  const { data: row, error } = existing
    ? await admin.from("users").update(profile).eq("id", existing.id).select(columns).single()
    : await admin.from("users").insert(profile).select(columns).single();
  if (error || !row) return json({ ok: false, reason: "save_failed" }, 500);
  if (row.banned) return json({ ok: false, reason: "banned" });

  return json({ ok: true, profile: row });
});
