import { getSupabase } from "./supabase";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, MEDIA_BUCKET, PAGE_SIZE } from "./constants";
import type { Member, MessageRow, MessageType, Profile, ProfileDetails, ReplyPreview, Role, RoleDef } from "./types";
import { uuid } from "./utils";

const MESSAGE_COLUMNS =
  "id,user_id,username,content,type,media_url,reply_to,created_at,avatar_url,author_handle,duration_ms,mentions,mention_everyone,mention_roles";

interface MemberRow {
  id: string;
  username: string;
  avatar_url: string | null;
  discord_username: string | null;
  role?: Role;
  is_admin: boolean;
  needs_role_sync?: boolean;
}

function toProfile(row: MemberRow, authId: string): Profile {
  return {
    userId: row.id,
    authId,
    username: row.username,
    avatarUrl: row.avatar_url,
    handle: row.discord_username,
    role: row.role ?? (row.is_admin ? "admin" : "member"),
    isAdmin: row.role ? row.role === "admin" : Boolean(row.is_admin),
    needsRoleSync: Boolean(row.needs_role_sync),
  };
}

export async function signInWithDiscord(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "discord",
    options: {
      scopes: "identify guilds.members.read",
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

export type VerifyResult =
  | { ok: true; profile: Profile }
  | { ok: false; reason: string; guild?: string | null; invite?: string | null };

/** Ask the edge function to confirm Discord server membership (needs the fresh Discord token). */
export async function verifyDiscord(providerToken: string, authId: string): Promise<VerifyResult> {
  const { data, error } = await getSupabase().functions.invoke("discord-verify", {
    body: { provider_token: providerToken },
  });
  if (error && !data) throw error;
  const res = data as { ok: boolean; reason?: string; profile?: MemberRow; guild?: string; invite?: string };
  if (res.ok && res.profile) return { ok: true, profile: toProfile(res.profile, authId) };
  return { ok: false, reason: res.reason ?? "unknown", guild: res.guild, invite: res.invite };
}

/** Heartbeat for a verified member; also returns their current profile. */
export async function touchMember(authId: string): Promise<Profile> {
  const { data, error } = await getSupabase().rpc("touch_member");
  if (error) throw error;
  return toProfile(data as MemberRow, authId);
}

export async function fetchLatestMessages(limit = PAGE_SIZE): Promise<MessageRow[]> {
  const { data, error } = await getSupabase()
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as MessageRow[]).reverse();
}

export async function fetchMessagesBefore(beforeIso: string, limit = PAGE_SIZE): Promise<MessageRow[]> {
  const { data, error } = await getSupabase()
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .lt("created_at", beforeIso)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as MessageRow[]).reverse();
}

/** Messages in [fromIso, beforeIso) — used to fill the gap when jumping to an old message. */
export async function fetchMessagesBetween(fromIso: string, beforeIso: string, limit = 1000): Promise<MessageRow[]> {
  const { data, error } = await getSupabase()
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .gte("created_at", fromIso)
    .lt("created_at", beforeIso)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data as MessageRow[];
}

export async function fetchReplyPreviews(ids: string[]): Promise<ReplyPreview[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase().from("messages").select("id,username,content,type,created_at,avatar_url").in("id", ids);
  if (error) throw error;
  return data as ReplyPreview[];
}

export async function searchMessages(query: string): Promise<MessageRow[]> {
  const { data, error } = await getSupabase().rpc("search_messages", { p_query: query, p_limit: 50 });
  if (error) throw error;
  return data as MessageRow[];
}

export interface SendMessageInput {
  id: string;
  content: string;
  type: MessageType;
  mediaUrl?: string | null;
  replyTo?: string | null;
  durationMs?: number | null;
}

export async function postMessage(input: SendMessageInput): Promise<MessageRow> {
  const { data, error } = await getSupabase().rpc("post_message", {
    p_id: input.id,
    p_content: input.content,
    p_type: input.type,
    p_media_url: input.mediaUrl ?? null,
    p_reply_to: input.replyTo ?? null,
    p_duration_ms: input.durationMs ?? null,
  });
  if (error) throw error;
  return data as MessageRow;
}

export async function removeMessage(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("remove_message", { p_id: id });
  if (error) throw error;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Returns an error message, or null if the file can be uploaded. */
export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Format tidak didukung. Gunakan JPG, JPEG, PNG, WEBP, atau GIF.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Ukuran file maksimal ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`;
  }
  return null;
}

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};

/** Uploads into the member's own folder (enforced by the storage policy). Returns the public URL. */
export async function uploadMedia(authId: string, file: Blob): Promise<string> {
  const contentType = (file.type || "application/octet-stream").split(";")[0];
  const ext = EXTENSIONS[contentType] ?? AUDIO_EXTENSIONS[contentType] ?? "bin";
  const month = new Date().toISOString().slice(0, 7);
  const path = `${authId}/${month}/${uuid()}.${ext}`;
  const storage = getSupabase().storage.from(MEDIA_BUCKET);
  const { error } = await storage.upload(path, file, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

export async function fetchMessagesAfter(afterIso: string, limit = 500): Promise<MessageRow[]> {
  const { data, error } = await getSupabase()
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .gte("created_at", afterIso)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data as MessageRow[];
}

export interface AppSettings {
  maintenance: boolean;
  message: string | null;
  guildName: string | null;
  inviteUrl: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = { maintenance: false, message: null, guildName: null, inviteUrl: null };

/** Global switches (maintenance mode, Discord server info). Missing table/row → app runs normally. */
export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await getSupabase()
    .from("app_settings")
    .select("maintenance,maintenance_message,discord_guild_name,discord_invite_url")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS };
  return {
    maintenance: Boolean(data.maintenance),
    message: data.maintenance_message ?? null,
    guildName: data.discord_guild_name ?? null,
    inviteUrl: data.discord_invite_url ?? null,
  };
}

interface MemberListRow {
  id: string;
  username: string;
  discord_username: string | null;
  avatar_url: string | null;
  role: Role;
  banned: boolean;
  last_seen: string;
  role_ids: string[] | null;
}

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await getSupabase().rpc("list_members");
  if (error) throw error;
  return (data as MemberListRow[]).map((m) => ({
    id: m.id,
    username: m.username,
    handle: m.discord_username,
    avatarUrl: m.avatar_url,
    role: m.role,
    banned: m.banned,
    lastSeen: m.last_seen,
    roleIds: m.role_ids ?? [],
  }));
}

export async function fetchRoleDefs(): Promise<RoleDef[]> {
  const { data, error } = await getSupabase().from("discord_roles").select("id,name,color,color2,color3,position,slug").order("position", { ascending: false });
  if (error) return [];
  return data as RoleDef[];
}

export async function getProfile(id: string): Promise<ProfileDetails> {
  const { data, error } = await getSupabase().rpc("get_profile", { p_id: id });
  if (error) throw error;
  return data as ProfileDetails;
}

export async function setMemberRole(id: string, role: Role): Promise<void> {
  const { error } = await getSupabase().rpc("set_member_role", { p_id: id, p_role: role });
  if (error) throw error;
}

export async function setMemberBanned(id: string, banned: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("set_member_banned", { p_id: id, p_banned: banned });
  if (error) throw error;
}

export type SearchHas = "media" | "image" | "gif" | "voice" | "link";

export interface SearchFilters {
  query?: string;
  from?: string | null;
  mentions?: string | null;
  has?: SearchHas | null;
}

export async function searchMessagesAdvanced(filters: SearchFilters): Promise<MessageRow[]> {
  const { data, error } = await getSupabase().rpc("search_messages_v2", {
    p_query: filters.query?.trim() || null,
    p_from: filters.from ?? null,
    p_mentions: filters.mentions ?? null,
    p_has: filters.has ?? null,
    p_limit: 60,
  });
  if (error) throw error;
  return data as MessageRow[];
}
