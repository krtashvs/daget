"use client";

import { Copy, ExternalLink, ImageIcon, Reply, Trash2, UserRound, X } from "lucide-react";
import { useCallback } from "react";
import { deleteMessage } from "@/lib/chat-actions";
import { formatStamp, mediaLabel, memberStyle } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { useEscape } from "../ui/useEscape";
import { copyText } from "./MessageItem";

/** Long-press / right-click menu for a message. Bottom sheet on mobile, card on desktop. */
export function MessageActionSheet() {
  const message = useChat((s) => s.sheetMessage);
  const myId = useChat((s) => s.session?.userId);
  const isAdmin = useChat((s) => s.session?.role === "admin" || s.session?.role === "mod");
  const members = useChat((s) => s.members);
  const roleDefs = useChat((s) => s.roleDefs);
  const close = useCallback(() => useChat.getState().setSheetMessage(null), []);
  useEscape(Boolean(message), close);
  if (!message) return null;

  const isOwn = message.user_id === myId;
  const media = message.localPreview ?? message.media_url;
  const act = (fn: () => void) => () => {
    close();
    fn();
  };

  const items = [
    !message.status && { icon: Reply, label: "Balas", onClick: act(() => useChat.getState().setReplyingTo(message)) },
    message.user_id && { icon: UserRound, label: "Lihat Profil", onClick: () => useChat.getState().openProfile(message.user_id) },
    message.content && { icon: Copy, label: "Salin Teks", onClick: act(() => void copyText(message.content)) },
    media && message.type !== "voice" && { icon: ImageIcon, label: message.type === "gif" ? "Lihat GIF" : "Lihat Gambar", onClick: act(() => useChat.getState().setLightboxUrl(media)) },
    (isOwn || (isAdmin && !message.status)) && { icon: Trash2, label: "Hapus Pesan", danger: true, onClick: act(() => useChat.getState().setDeleteTarget(message)) },
  ].filter(Boolean) as { icon: typeof Reply; label: string; onClick: () => void; danger?: boolean }[];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Aksi pesan">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="glass-strong relative w-full animate-sheet-up rounded-t-3xl p-2 pb-[max(var(--safe-bottom),12px)] shadow-2xl sm:max-w-sm sm:animate-slide-up sm:rounded-3xl sm:pb-2">
        <div className="mx-auto mb-2 mt-1 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex gap-3 px-3 pb-3 pt-1">
          <Avatar username={message.username} src={message.avatar_url} size={32} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2 text-sm">
              <span
                className="truncate font-semibold"
                style={memberStyle(message.username, message.user_id ? members[message.user_id]?.roleIds : undefined, roleDefs)}
              >
                {message.username}
              </span>
              <span className="shrink-0 text-[11px] text-zinc-500">{formatStamp(message.created_at)}</span>
            </p>
            {message.author_handle && <p className="text-[11px] text-zinc-500">@{message.author_handle} · Discord</p>}
            <p className="line-clamp-2 text-sm text-zinc-400">{message.content || mediaLabel(message.type)}</p>
          </div>
        </div>
        <div className="space-y-0.5">
          {items.map(({ icon: Icon, label, onClick, danger }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-medium transition hover:bg-white/[0.06] active:bg-white/[0.1] ${danger ? "text-red-300" : "text-zinc-100"}`}
            >
              <Icon className="h-5 w-5 opacity-80" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DeleteConfirmDialog() {
  const target = useChat((s) => s.deleteTarget);
  const close = useCallback(() => useChat.getState().setDeleteTarget(null), []);
  useEscape(Boolean(target), close);
  if (!target) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="glass-strong relative w-full max-w-sm animate-slide-up rounded-3xl p-5 shadow-2xl">
        <h2 id="delete-title" className="text-lg font-semibold text-zinc-50">
          Hapus pesan?
        </h2>
        <p className="mt-1 text-sm text-zinc-400">Pesan ini akan dihapus untuk semua orang.</p>
        <div className="mt-4 rounded-2xl bg-black/30 p-3 text-sm text-zinc-300 ring-1 ring-inset ring-white/[0.05]">
          <p className="line-clamp-3 whitespace-pre-wrap break-words">{target.content || mediaLabel(target.type)}</p>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={close} className="h-11 flex-1 rounded-2xl bg-white/[0.06] text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.1]">
            Batal
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              close();
              void deleteMessage(target.id);
            }}
            className="h-11 flex-1 rounded-2xl bg-red-500/90 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

export function Lightbox() {
  const url = useChat((s) => s.lightboxUrl);
  const close = useCallback(() => useChat.getState().setLightboxUrl(null), []);
  useEscape(Boolean(url), close);
  if (!url) return null;
  const external = url.startsWith("http");

  return (
    <div className="fixed inset-0 z-[90] flex animate-fade-in items-center justify-center bg-black/90 p-4 backdrop-blur-md" role="dialog" aria-modal="true" onClick={close}>
      <div className="absolute right-3 top-[calc(var(--safe-top)+12px)] flex gap-1">
        {external && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="icon-btn h-10 w-10 bg-white/10 text-zinc-100"
            aria-label="Buka file asli"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
        <button type="button" onClick={close} className="icon-btn h-10 w-10 bg-white/10 text-zinc-100" aria-label="Tutup">
          <X className="h-5 w-5" />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Pratinjau"
        className="max-h-[88dvh] max-w-full rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
