"use client";

import { AlertCircle, Copy, ImageOff, LoaderCircle, Reply, RotateCcw, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { deleteMessage, retryMessage } from "@/lib/chat-actions";
import type { ChatMessage } from "@/lib/types";
import { cn, formatFull, formatStamp, formatTime, usernameColor } from "@/lib/utils";
import { useLongPress } from "@/hooks/useLongPress";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { MessageContent, mentionsUser } from "./MessageContent";
import { ReplyReference } from "./ReplyReference";

interface MessageItemProps {
  message: ChatMessage;
  grouped: boolean;
  isOwn: boolean;
  me: string;
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

export const MessageItem = memo(function MessageItem({ message, grouped, isOwn, me, highlighted }: MessageItemProps) {
  const openSheet = useCallback(() => useChat.getState().setSheetMessage(message), [message]);
  const longPress = useLongPress(openSheet);
  const mentioned = !isOwn && mentionsUser(message.content, me);
  const media = message.localPreview ?? message.media_url;
  const [broken, setBroken] = useState(false);

  const onReply = () => useChat.getState().setReplyingTo(message);
  const onDelete = (e: React.MouseEvent) => {
    if (e.shiftKey || message.status) void deleteMessage(message.id);
    else useChat.getState().setDeleteTarget(message);
  };

  return (
    <div
      id={`msg-${message.id}`}
      data-message-id={message.id}
      className={cn(
        "group relative px-4 [-webkit-touch-callout:none] hover:bg-white/[0.025]",
        grouped ? "py-0.5" : "pb-0.5 pt-3",
        mentioned && "bg-white/[0.035] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-r before:bg-zinc-200/70",
        highlighted && "animate-highlight",
      )}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        e.preventDefault();
        openSheet();
      }}
      {...longPress}
    >
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
          <Avatar username={message.username} size={40} className="mt-0.5" />
        )}

        <div className={cn("min-w-0 flex-1", message.status === "sending" && "opacity-60")}>
          {!grouped && (
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-[15px] font-semibold leading-5" style={{ color: usernameColor(message.username) }}>
                {message.username}
              </span>
              <time dateTime={message.created_at} title={formatFull(message.created_at)} className="shrink-0 text-[11px] text-zinc-500">
                {formatStamp(message.created_at)}
              </time>
            </div>
          )}

          <MessageContent content={message.content} me={me} />

          {media && broken && (
            <div className="mt-1.5 inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-500 ring-1 ring-inset ring-white/[0.06]">
              <ImageOff className="h-4 w-4" /> Media tidak dapat dimuat
            </div>
          )}

          {media && !broken && (
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
          {isOwn && (
            <button type="button" onClick={onDelete} className="icon-btn h-8 w-8 hover:text-red-300" aria-label="Hapus pesan" title="Hapus (Shift+klik untuk langsung)">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});
