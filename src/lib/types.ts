export type MessageType = "text" | "image" | "gif" | "voice";

/** Row of public.messages as returned by Supabase. */
export interface MessageRow {
  id: string;
  user_id: string | null;
  username: string;
  content: string;
  type: MessageType;
  media_url: string | null;
  reply_to: string | null;
  created_at: string;
  /** Discord avatar at the time of sending (null for legacy/anonymous messages). */
  avatar_url?: string | null;
  /** Discord @username at the time of sending. */
  author_handle?: string | null;
  /** Voice note length. */
  duration_ms?: number | null;
  /** Ids of members mentioned with @username (resolved by the server). */
  mentions?: string[] | null;
  /** Sent by an admin/moderator with @everyone or @here. */
  mention_everyone?: boolean | null;
  /** Discord role ids mentioned with @role-slug. */
  mention_roles?: string[] | null;
}

/** Message as held in the client store (row + optimistic-send state). */
export interface ChatMessage extends MessageRow {
  status?: "sending" | "failed";
  /** Object URL for an image that is still uploading. */
  localPreview?: string;
  /** Pending file kept so a failed upload can be retried. */
  pendingFile?: Blob;
}

export interface ReplyPreview {
  id: string;
  username: string;
  content: string;
  type: MessageType;
  created_at: string;
  avatar_url?: string | null;
}

export type Role = "member" | "mod" | "admin";

/** Cosmetic role mirrored from the Discord server (colour only, no permissions). */
export interface RoleDef {
  id: string;
  name: string;
  color: string;
  /** Second colour for gradient role names (Discord enhanced role styles). */
  color2?: string | null;
  /** Third colour (Discord "holographic" style). */
  color3?: string | null;
  position: number;
  /** Text used to mention the role, e.g. "rizz-academy-student". */
  slug?: string | null;
}

/** Entry of the member directory (list_members). */
export interface Member {
  id: string;
  username: string;
  handle: string | null;
  avatarUrl: string | null;
  /** Daget moderation level (not shown next to names). */
  role: Role;
  banned: boolean;
  lastSeen: string;
  /** Discord server role ids, highest first. */
  roleIds: string[];
}

/** Full profile card data (get_profile). */
export interface ProfileDetails {
  id: string;
  username: string;
  discord_username: string | null;
  discord_id: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  accent_color: number | null;
  role: Role;
  banned: boolean;
  is_discord: boolean;
  created_at: string;
  guild_joined_at: string | null;
  last_seen: string;
  roles_synced_at: string | null;
  message_count: number;
  discord_roles: { id: string; name: string; color: string; color2?: string | null; color3?: string | null }[];
}

/** Signed-in, verified Discord member. */
export interface Profile {
  /** public.users.id */
  userId: string;
  /** auth.users.id — storage uploads live under this folder. */
  authId: string;
  username: string;
  avatarUrl: string | null;
  handle: string | null;
  role: Role;
  isAdmin: boolean;
  /** Logged in before role syncing existed — needs one Discord re-login. */
  needsRoleSync: boolean;
}

export interface OnlineUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  onlineAt: string;
}

export interface GifResult {
  id: string;
  title: string;
  preview: string;
  url: string;
  width: number;
  height: number;
}

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";
