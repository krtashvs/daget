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

/** Signed-in, verified Discord member. */
export interface Profile {
  /** public.users.id */
  userId: string;
  /** auth.users.id — storage uploads live under this folder. */
  authId: string;
  username: string;
  avatarUrl: string | null;
  handle: string | null;
  isAdmin: boolean;
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
