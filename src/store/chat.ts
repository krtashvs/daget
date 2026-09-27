import { create } from "zustand";
import type { ChatMessage, ConnectionStatus, MessageRow, OnlineUser, ReplyPreview, Session } from "@/lib/types";
import { compareMessages } from "@/lib/utils";
import { TYPING_TTL_MS } from "@/lib/constants";

export type SidePanel = "members" | "search" | null;

export interface Toast {
  id: number;
  message: string;
}

interface ChatState {
  session: Session | null;
  status: ConnectionStatus;

  messages: ChatMessage[];
  initialLoaded: boolean;
  hasMore: boolean;
  loadingOlder: boolean;

  /** Reply previews for messages not in `messages`. `null` = original was deleted. */
  replyCache: Record<string, ReplyPreview | null>;
  replyingTo: ChatMessage | null;

  online: OnlineUser[];
  /** username → expiry timestamp (ms). */
  typing: Record<string, number>;

  panel: SidePanel;
  highlightId: string | null;
  /** Incremented to ask the message list to scroll to the bottom. */
  scrollToBottomTick: number;
  toasts: Toast[];

  /** Image/GIF file attached in the composer, not yet sent. */
  draftFile: File | null;
  /** Message whose action sheet (long-press / right-click) is open. */
  sheetMessage: ChatMessage | null;
  /** Message awaiting delete confirmation. */
  deleteTarget: ChatMessage | null;
  lightboxUrl: string | null;

  setSession: (session: Session | null) => void;
  setStatus: (status: ConnectionStatus) => void;

  setInitialMessages: (rows: MessageRow[], hasMore: boolean) => void;
  mergeMessages: (rows: ChatMessage[]) => void;
  prependMessages: (rows: MessageRow[], hasMore: boolean) => void;
  addLocalMessage: (message: ChatMessage) => void;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;
  applyServerMessage: (row: MessageRow) => void;
  applyServerUpdate: (row: MessageRow) => void;
  removeMessage: (id: string) => void;
  setLoadingOlder: (loading: boolean) => void;

  cacheReplies: (previews: ReplyPreview[], requestedIds: string[]) => void;
  setReplyingTo: (message: ChatMessage | null) => void;

  setOnline: (users: OnlineUser[]) => void;
  setTyping: (username: string, typing: boolean) => void;
  pruneTyping: () => void;

  setPanel: (panel: SidePanel) => void;
  togglePanel: (panel: Exclude<SidePanel, null>) => void;
  setHighlight: (id: string | null) => void;
  requestScrollToBottom: () => void;

  pushToast: (message: string) => void;
  dismissToast: (id: number) => void;

  setDraftFile: (file: File | null) => void;
  setSheetMessage: (message: ChatMessage | null) => void;
  setDeleteTarget: (message: ChatMessage | null) => void;
  setLightboxUrl: (url: string | null) => void;

  resetRoom: () => void;
}

let toastSeq = 0;

function sortUnique(list: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of list) map.set(m.id, m);
  return Array.from(map.values()).sort(compareMessages);
}

const initialRoom = {
  status: "connecting" as ConnectionStatus,
  messages: [] as ChatMessage[],
  initialLoaded: false,
  hasMore: true,
  loadingOlder: false,
  replyCache: {} as Record<string, ReplyPreview | null>,
  replyingTo: null as ChatMessage | null,
  online: [] as OnlineUser[],
  typing: {} as Record<string, number>,
  highlightId: null as string | null,
  draftFile: null as File | null,
  sheetMessage: null as ChatMessage | null,
  deleteTarget: null as ChatMessage | null,
  lightboxUrl: null as string | null,
};

export const useChat = create<ChatState>()((set, get) => ({
  session: null,
  ...initialRoom,
  panel: null,
  scrollToBottomTick: 0,
  toasts: [],

  setSession: (session) => set({ session }),
  setStatus: (status) => set({ status }),

  setInitialMessages: (rows, hasMore) =>
    set((s) => {
      // Keep optimistic messages that are still in flight.
      const local = s.messages.filter((m) => m.status);
      return { messages: sortUnique([...rows, ...local]), hasMore, initialLoaded: true };
    }),

  mergeMessages: (rows) =>
    set((s) => {
      const byId = new Map(s.messages.map((m) => [m.id, m]));
      for (const row of rows) {
        const existing = byId.get(row.id);
        byId.set(row.id, existing ? { ...existing, ...row, status: undefined, localPreview: undefined, pendingFile: undefined } : row);
      }
      return { messages: Array.from(byId.values()).sort(compareMessages) };
    }),

  prependMessages: (rows, hasMore) =>
    set((s) => ({ messages: sortUnique([...rows, ...s.messages]), hasMore })),

  addLocalMessage: (message) => set((s) => ({ messages: sortUnique([...s.messages, message]) })),

  patchMessage: (id, patch) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

  applyServerMessage: (row) => {
    const existing = get().messages.find((m) => m.id === row.id);
    if (existing?.localPreview) URL.revokeObjectURL(existing.localPreview);
    get().mergeMessages([row]);
  },

  applyServerUpdate: (row) =>
    set((s) => {
      const idx = s.messages.findIndex((m) => m.id === row.id);
      if (idx === -1) return {};
      const messages = s.messages.slice();
      messages[idx] = { ...messages[idx], ...row };
      return { messages };
    }),

  removeMessage: (id) =>
    set((s) => {
      const target = s.messages.find((m) => m.id === id);
      if (target?.localPreview) URL.revokeObjectURL(target.localPreview);
      return {
        messages: s.messages.filter((m) => m.id !== id),
        replyCache: { ...s.replyCache, [id]: null },
        replyingTo: s.replyingTo?.id === id ? null : s.replyingTo,
        highlightId: s.highlightId === id ? null : s.highlightId,
      };
    }),

  setLoadingOlder: (loadingOlder) => set({ loadingOlder }),

  cacheReplies: (previews, requestedIds) =>
    set((s) => {
      const cache = { ...s.replyCache };
      for (const id of requestedIds) cache[id] = null;
      for (const p of previews) cache[p.id] = p;
      return { replyCache: cache };
    }),

  setReplyingTo: (replyingTo) => set({ replyingTo }),

  setOnline: (online) => set({ online }),

  setTyping: (username, typing) =>
    set((s) => {
      const next = { ...s.typing };
      if (typing) next[username] = Date.now() + TYPING_TTL_MS;
      else delete next[username];
      return { typing: next };
    }),

  pruneTyping: () =>
    set((s) => {
      const now = Date.now();
      const entries = Object.entries(s.typing);
      const alive = entries.filter(([, exp]) => exp > now);
      if (alive.length === entries.length) return {};
      return { typing: Object.fromEntries(alive) };
    }),

  setPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  setHighlight: (highlightId) => set({ highlightId }),
  requestScrollToBottom: () => set((s) => ({ scrollToBottomTick: s.scrollToBottomTick + 1 })),

  pushToast: (message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== message), { id, message }].slice(-3) }));
    window.setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setDraftFile: (draftFile) => set({ draftFile }),
  setSheetMessage: (sheetMessage) => set({ sheetMessage }),
  setDeleteTarget: (deleteTarget) => set({ deleteTarget }),
  setLightboxUrl: (lightboxUrl) => set({ lightboxUrl }),

  resetRoom: () => {
    for (const m of get().messages) if (m.localPreview) URL.revokeObjectURL(m.localPreview);
    set({ ...initialRoom });
  },
}));
