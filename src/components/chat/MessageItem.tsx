"use client";

import { AlertCircle, Copy, CornerUpLeft, ImageOff, LoaderCircle, Reply, RotateCcw, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { deleteMessage, retryMessage } from "@/lib/chat-actions";
import type { ChatMessage } from "@/lib/types";
import { cn, formatFull, formatStamp, formatTime, memberColor } from "@/lib/utils";
import { useLongPress } from "@/hooks/useLongPress";
import { useSwipeReply } from "@/hooks/useSwipeReply";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { MessageContent, mentionsUser } from "./MessageContent";
import { ReplyReference } from "./ReplyReference";
import { VoiceNote } from "./VoiceNote";

interface MessageItemProps {
  message: ChatMessage;
  grouped: boolean;
  isOwn: boolean;
  /** Admins may delete anyone's message. */
  canModerate: boolean;
  me: string;
  myId: string;
  highlighted: boolean;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    useChat.getState().pushToast("Teks disalin.");
  } catch {
    useChat.getState().pushToast("Gagal menyalin teks.");
  }
}

export const MessageItem = memo(function MessageItem({ message, grouped, isOwn, canModerate, me, myId, highlighted }: MessageItemProps) {
  const author = useChat((s) => (message.user_id ? s.members[message.user_id] : undefined));
  const roleDefs = useChat((s) => s.roleDefs);
  const authorName = author?.username ?? message.username;
  const color = memberColor(authorName, author?.roleIds, roleDefs);
  const openAuthor = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (message.user_id) useChat.getState().openProfile(message.user_id);
  };
  const openSheet = useCallback(() => useChat.getState().setSheetMessage(message), [message]);
  const longPress = useLongPress(openSheet);
  const startReply = useCallback(() => useChat.getState().setReplyingTo(message), [message]);
  const swipe = useSwipeReply(startReply, !message.status);
  const canDelete = isOwn || canModerate;
  const everyone = Boolean(message.mention_everyone);
  const mentioned =
    !isOwn && !everyone && (Boolean(message.mentions?.includes(myId)) || (!message.mentions?.length && mentionsUser(message.content, me)));
  const media = message.localPreview ?? message.media_url;
  const [broken, setBroken] = useState(false);

  const onReply = startReply;
  const onDelete = (e: React.MouseEvent) => {
    if (e.shiftKey || message.status) void deleteMessage(message.id);
    else useChat.getState().setDeleteTarget(message);
  };

  return (
    <div
      id={`msg-${message.id}`}
      data-message-id={message.id}
      className={cn(
        "group relative touch-pan-y px-4 [-webkit-touch-callout:none] hover:bg-white/[0.025]",
        grouped ? "py-0.5" : "pb-0.5 pt-3",
        everyone && "bg-amber-300/[0.05] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-r before:bg-amber-300/80",
        mentioned && "bg-white/[0.035] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-r before:bg-zinc-200/70",
        highlighted && "animate-highlight",
      )}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        e.preventDefault();
        openSheet();
      }}
      onTouchStart={(e) => {
        longPress.onTouchStart(e);
        swipe.handlers.onTouchStart(e);
      }}
      onTouchMove={(e) => {
        longPress.onTouchMove(e);
        swipe.handlers.onTouchMove(e);
      }}
      onTouchEnd={() => {
        longPress.onTouchEnd();
        swipe.handlers.onTouchEnd();
      }}
      onTouchCancel={() => {
        longPress.onTouchCancel();
        swipe.handlers.onTouchCancel();
      }}
      onClickCapture={longPress.onClickCapture}
    >
      <div
        ref={swipe.iconRef}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-zinc-100 opacity-0"
        style={{ transform: "translateY(-50%) scale(0.6)" }}
      >
        <CornerUpLeft className="h-4 w-4" />
      </div>
      <div ref={swipe.bodyRef}>
      {message.reply_to && !grouped && <ReplyReference replyId={message.reply_to} />}

      <div className="flex gap-3">
        {grouped ? (
          <time
            dateTime={message.created_at}
            title={formatFull(message.created_at)}
            className="w-10 shrink-0 select-none pt-[3px] text-right text-[10px] leading-5 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100"
          >
            {formatTime(message.created_at)}
          </time>
        ) : (
          <button type="button" onClick={openAuthor} className="mt-0.5 shrink-0 self-start rounded-full transition hover:opacity-85" aria-label={`Profil ${message.username}`}>
            <Avatar username={message.username} src={author?.avatarUrl ?? message.avatar_url} size={40} />
          </button>
        )}

        <div className={cn("min-w-0 flex-1", message.status === "sending" && "opacity-60")}>
          {!grouped && (
            <div className="flex min-w-0 items-baseline gap-2">
              <button
                type="button"
                onClick={openAuthor}
                className="min-w-0 truncate text-[15px] font-semibold leading-5 hover:underline"
                style={{ color }}
              >
                {authorName}
              </button>
              <time dateTime={message.created_at} title={formatFull(message.created_at)} className="shrink-0 text-[11px] text-zinc-500">
                {formatStamp(message.created_at)}
              </time>
            </div>
          )}

          <MessageContent content={message.content} me={me} myId={myId} everyone={everyone} />

          {message.type === "voice" && media && (
            <VoiceNote id={message.id} src={media} durationMs={message.duration_ms} sending={message.status === "sending"} />
          )}

          {message.type !== "voice" && media && broken && (
            <div className="mt-1.5 inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-500 ring-1 ring-inset ring-white/[0.06]">
              <ImageOff className="h-4 w-4" /> Media tidak dapat dimuat
            </div>
          )}

          {message.type !== "voice" && media && !broken && (
            <button
              type="button"
              onClick={() => useChat.getState().setLightboxUrl(media)}
              className="relative mt-1.5 block max-w-full overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]"
              aria-label={message.type === "gif" ? "Buka GIF" : "Buka gambar"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media}
                alt={message.type === "gif" ? "GIF" : "Gambar"}
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={() => setBroken(true)}
                className="block max-h-[320px] w-auto max-w-[min(100%,380px)] object-contain"
              />
              {message.type === "gif" && (
                <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white/90 backdrop-blur">
                  GIF
                </span>
              )}
              {message.status === "sending" && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <LoaderCircle className="h-6 w-6 animate-spin text-white/80" />
                </span>
              )}
            </button>
          )}

          {message.status === "failed" && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-red-300/90">
              <span className="inline-flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Gagal terkirim
              </span>
              <button type="button" onClick={() => retryMessage(message.id)} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                <RotateCcw className="h-3 w-3" /> Coba lagi
              </button>
              <button type="button" onClick={() => void deleteMessage(message.id)} className="font-medium underline-offset-2 hover:underline">
                Buang
              </button>
            </div>
          )}
        </div>
      </div>

      </div>

      {!message.status && (
        <div className="glass-strong absolute -top-3 right-3 z-10 hidden items-center rounded-xl p-0.5 shadow-lg shadow-black/30 [@media(hover:hover)]:group-hover:flex">
          <button type="button" onClick={onReply} className="icon-btn h-8 w-8" aria-label="Balas" title="Balas">
            <Reply className="h-4 w-4" />
          </button>
          {message.content && (
            <button type="button" onClick={() => void copyText(message.content)} className="icon-btn h-8 w-8" aria-label="Salin teks" title="Salin teks">
              <Copy className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={onDelete} className="icon-btn h-8 w-8 hover:text-red-300" aria-label="Hapus pesan" title="Hapus (Shift+klik untuk langsung)">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});
