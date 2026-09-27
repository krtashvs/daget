"use client";

import {
  deleteMessage as apiDeleteMessage,
  fetchMessagesAfter,
  fetchMessagesBefore,
  fetchMessagesBetween,
  fetchLatestMessages,
  fetchReplyPreviews,
  sendMessage as apiSendMessage,
  uploadImage,
} from "./api";
import { PAGE_SIZE } from "./constants";
import type { ChatMessage, GifResult, MessageRow, MessageType } from "./types";
import { friendlyError, uuid } from "./utils";
import { useChat } from "@/store/chat";

const store = useChat.getState;
const inflightReplies = new Set<string>();

/** Fetch previews for replied-to messages that are not loaded locally. */
export async function ensureReplies(rows: Pick<MessageRow, "reply_to">[]) {
  const s = store();
  const known = new Set(s.messages.map((m) => m.id));
  const ids = Array.from(
    new Set(
      rows
        .map((r) => r.reply_to)
        .filter((id): id is string => !!id && !known.has(id) && !(id in s.replyCache) && !inflightReplies.has(id)),
    ),
  );
  if (ids.length === 0) return;
  ids.forEach((id) => inflightReplies.add(id));
  try {
    const previews = await fetchReplyPreviews(ids);
    store().cacheReplies(previews, ids);
  } catch {
    /* previews are best-effort */
  } finally {
    ids.forEach((id) => inflightReplies.delete(id));
  }
}

let syncing: Promise<void> | null = null;

/** Load the latest page, or catch up on anything missed since the last confirmed message. */
export function syncMessages(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const s = store();
      const confirmed = s.messages.filter((m) => !m.status);
      const last = confirmed[confirmed.length - 1];
      if (!s.initialLoaded || !last) {
        const rows = await fetchLatestMessages();
        store().setInitialMessages(rows, rows.length >= PAGE_SIZE);
        void ensureReplies(rows);
        return;
      }
      const rows = await fetchMessagesAfter(last.created_at);
      if (rows.length >= 500) {
        // Too far behind — start fresh from the latest page.
        const latest = await fetchLatestMessages();
        store().resetRoom();
        store().setInitialMessages(latest, latest.length >= PAGE_SIZE);
        void ensureReplies(latest);
        return;
      }
      store().mergeMessages(rows);
      void ensureReplies(rows);
    } catch (error) {
      store().pushToast(friendlyError(error, "Gagal memuat pesan."));
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export async function loadOlderMessages() {
  const s = store();
  if (s.loadingOlder || !s.hasMore || !s.initialLoaded) return;
  const oldest = s.messages.find((m) => !m.status);
  if (!oldest) return;
  s.setLoadingOlder(true);
  try {
    const rows = await fetchMessagesBefore(oldest.created_at);
    store().prependMessages(rows, rows.length >= PAGE_SIZE);
    void ensureReplies(rows);
  } catch (error) {
    store().pushToast(friendlyError(error, "Gagal memuat pesan lama."));
  } finally {
    store().setLoadingOlder(false);
  }
}

/** Scroll to a message, loading the history between it and the loaded range if needed. */
export async function jumpToMessage(target: Pick<MessageRow, "id" | "created_at">) {
  const s = store();
  if (!s.messages.some((m) => m.id === target.id)) {
    const oldest = s.messages.find((m) => !m.status);
    try {
      const rows = oldest ? await fetchMessagesBetween(target.created_at, oldest.created_at) : [];
      if (!rows.some((r) => r.id === target.id)) {
        store().pushToast("Pesan tidak ditemukan atau sudah dihapus.");
        return;
      }
      store().prependMessages(rows, store().hasMore);
      void ensureReplies(rows);
    } catch (error) {
      store().pushToast(friendlyError(error, "Gagal membuka pesan."));
      return;
    }
  }
  store().setHighlight(target.id);
  window.setTimeout(() => {
    if (store().highlightId === target.id) store().setHighlight(null);
  }, 2200);
}

function baseMessage(type: MessageType, content: string): ChatMessage | null {
  const s = store();
  if (!s.session) return null;
  return {
    id: uuid(),
    user_id: s.session.userId,
    username: s.session.username,
    content,
    type,
    media_url: null,
    reply_to: s.replyingTo?.id ?? null,
    created_at: new Date().toISOString(),
    status: "sending",
  };
}

async function deliver(message: ChatMessage) {
  const s = store();
  if (!s.session) return;
  try {
    let mediaUrl = message.media_url;
    if (message.pendingFile) {
      mediaUrl = await uploadImage(s.session.userId, message.pendingFile);
      store().patchMessage(message.id, { media_url: mediaUrl, pendingFile: undefined });
    }
    const row = await apiSendMessage(s.session.secret, {
      id: message.id,
      content: message.content,
      type: message.type,
      mediaUrl,
      replyTo: message.reply_to,
    });
    store().applyServerMessage(row);
  } catch (error) {
    store().patchMessage(message.id, { status: "failed" });
    store().pushToast(friendlyError(error, "Pesan gagal terkirim."));
  }
}

function enqueue(message: ChatMessage) {
  const s = store();
  s.addLocalMessage(message);
  s.setReplyingTo(null);
  s.requestScrollToBottom();
  void deliver(message);
}

export function sendText(content: string) {
  const text = content.trim();
  if (!text) return;
  const message = baseMessage("text", text);
  if (message) enqueue(message);
}

export function sendImage(file: File, caption: string) {
  const message = baseMessage(file.type === "image/gif" ? "gif" : "image", caption.trim());
  if (!message) return;
  enqueue({ ...message, pendingFile: file, localPreview: URL.createObjectURL(file) });
}

export function sendGif(gif: GifResult) {
  const message = baseMessage("gif", "");
  if (!message) return;
  enqueue({ ...message, media_url: gif.url });
}

export function retryMessage(id: string) {
  const message = store().messages.find((m) => m.id === id);
  if (!message || message.status !== "failed") return;
  store().patchMessage(id, { status: "sending" });
  void deliver({ ...message, status: "sending" });
}

export async function deleteMessage(id: string) {
  const s = store();
  const message = s.messages.find((m) => m.id === id);
  if (!message || !s.session) return;
  if (message.status) {
    // Never reached the server — just drop it locally.
    s.removeMessage(id);
    return;
  }
  s.removeMessage(id);
  try {
    await apiDeleteMessage(s.session.secret, id);
  } catch (error) {
    store().mergeMessages([message]);
    store().pushToast(friendlyError(error, "Gagal menghapus pesan."));
  }
}
