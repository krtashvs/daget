"use client";

import { LoaderCircle, SmilePlus, X } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useMemo } from "react";
import { reactTo } from "@/lib/chat-actions";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { useEscape } from "../ui/useEscape";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🙏", "💀"];

const EmojiPanel = dynamic(() => import("./EmojiPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center text-zinc-500">
      <LoaderCircle className="h-5 w-5 animate-spin" />
    </div>
  ),
});

/** Reaction pills under a message. */
export const ReactionBar = memo(function ReactionBar({ messageId }: { messageId: string }) {
  const rows = useChat((s) => s.reactions[messageId]);
  const myId = useChat((s) => s.session?.userId);
  const members = useChat((s) => s.members);

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of rows ?? []) {
      const list = map.get(r.emoji) ?? [];
      list.push(r.user_id);
      map.set(r.emoji, list);
    }
    return Array.from(map.entries());
  }, [rows]);

  if (groups.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {groups.map(([emoji, userIds]) => {
        const mine = Boolean(myId && userIds.includes(myId));
        const names = userIds.map((id) => members[id]?.username ?? "Anggota");
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void reactTo(messageId, emoji);
            }}
            title={`${names.slice(0, 10).join(", ")}${names.length > 10 ? ` +${names.length - 10}` : ""}`}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[13px] ring-1 ring-inset transition active:scale-95",
              mine ? "bg-white/[0.12] text-zinc-50 ring-white/35" : "bg-white/[0.04] text-zinc-300 ring-white/[0.08] hover:bg-white/[0.08]",
            )}
            aria-pressed={mine}
            aria-label={`${emoji} ${userIds.length}`}
          >
            <span className="text-[15px] leading-none">{emoji}</span>
            <span className="font-semibold tabular-nums">{userIds.length}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          useChat.getState().setReactionTarget(messageId);
        }}
        className="inline-flex h-7 items-center rounded-lg px-1.5 text-zinc-500 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.06] hover:text-zinc-200"
        aria-label="Tambah reaksi"
      >
        <SmilePlus className="h-4 w-4" />
      </button>
    </div>
  );
});

/** Quick emoji row (used in the long-press sheet). */
export function QuickReactionRow({ messageId, onDone }: { messageId: string; onDone: () => void }) {
  return (
    <div className="flex items-center justify-between gap-1 px-2 pb-2">
      {QUICK_REACTIONS.slice(0, 6).map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onDone();
            void reactTo(messageId, emoji);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-2xl transition hover:bg-white/[0.12] active:scale-90"
          aria-label={`Reaksi ${emoji}`}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={() => useChat.getState().setReactionTarget(messageId)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/[0.12]"
        aria-label="Emoji lainnya"
      >
        <SmilePlus className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Full reaction picker (quick row + searchable emoji list). */
export function ReactionPicker() {
  const target = useChat((s) => s.reactionTarget);
  const close = useCallback(() => useChat.getState().setReactionTarget(null), []);
  useEscape(Boolean(target), close);
  if (!target) return null;

  const pick = (emoji: string) => {
    close();
    void reactTo(target, emoji);
  };

  return (
    <div className="fixed inset-0 z-[78] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Pilih reaksi">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full animate-sheet-up overflow-hidden rounded-t-3xl border border-white/[0.08] bg-ink-850 pb-[max(var(--safe-bottom),8px)] shadow-2xl sm:max-w-sm sm:animate-slide-up sm:rounded-3xl sm:pb-0">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <p className="text-sm font-semibold text-zinc-200">Tambah reaksi</p>
          <button type="button" onClick={close} className="icon-btn h-8 w-8" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-between gap-1 px-3 pb-2">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-2xl transition hover:bg-white/[0.08] active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="border-t border-white/[0.05]">
          <EmojiPanel onPick={pick} />
        </div>
      </div>
    </div>
  );
}
