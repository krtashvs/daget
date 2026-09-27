export type MessageType = "text" | "image" | "gif";

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
}

/** Message as held in the client store (row + optimistic-send state). */
export interface ChatMessage extends MessageRow {
  status?: "sending" | "failed";
  /** Object URL for an image that is still uploading. */
  localPreview?: string;
  /** Pending file kept so a failed upload can be retried. */
  pendingFile?: File;
}

export interface ReplyPreview {
  id: string;
  username: string;
  content: string;
  type: MessageType;
  created_at: string;
}

export interface Session {
  userId: string;
  username: string;
  secret: string;
}

export interface OnlineUser {
  userId: string;
  username: string;
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
