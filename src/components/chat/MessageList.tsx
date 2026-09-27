"use client";

import { ArrowDown, Hash, LoaderCircle, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadOlderMessages } from "@/lib/chat-actions";
import { CHANNEL_NAME, GROUP_WINDOW_MS } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";
import { formatDayDivider, formatTime, isSameDay } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { MessageItem } from "./MessageItem";

const BOTTOM_THRESHOLD = 96;

function isGrouped(prev: ChatMessage | undefined, m: ChatMessage): boolean {
  if (!prev || m.reply_to) return false;
  if (prev.username !== m.username || prev.user_id !== m.user_id) return false;
  if (!isSameDay(prev.created_at, m.created_at)) return false;
  return Date.parse(m.created_at) - Date.parse(prev.created_at) < GROUP_WINDOW_MS;
}

export function MessageList({ topInset }: { topInset: number }) {
  const messages = useChat((s) => s.messages);
  const initialLoaded = useChat((s) => s.initialLoaded);
  const hasMore = useChat((s) => s.hasMore);
  const loadingOlder = useChat((s) => s.loadingOlder);
  const highlightId = useChat((s) => s.highlightId);
  const scrollTick = useChat((s) => s.scrollToBottomTick);
  const session = useChat((s) => s.session);
  const me = session?.username ?? "";
  const myId = session?.userId ?? "";

  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  const stick = useRef(true);
  const snapshot = useRef({ scrollHeight: 0, scrollTop: 0 });
  const prevEdges = useRef<{ first?: string; last?: string }>({});

  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState<{ count: number; since: string } | null>(null);

  const takeSnapshot = () => {
    const el = scrollerRef.current;
    if (el) snapshot.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
  };

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollerRef.current;
    if (!el) return;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setAtBottom(true);
    setUnread(null);
  }, []);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    stick.current = bottom;
    setAtBottom(bottom);
    if (bottom) setUnread(null);
    takeSnapshot();
  };

  // Keep position stable on prepend, follow new messages when pinned to the bottom.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;
    const prev = prevEdges.current;

    if (prev.first && first !== prev.first && messages.some((m) => m.id === prev.first)) {
      el.scrollTop = snapshot.current.scrollTop + (el.scrollHeight - snapshot.current.scrollHeight);
    }

    if (last && last !== prev.last) {
      const lastMsg = messages[messages.length - 1];
      if (!prev.last || stick.current || lastMsg.user_id === myId) {
        el.scrollTop = el.scrollHeight;
        stick.current = true;
      } else {
        const prevIdx = messages.findIndex((m) => m.id === prev.last);
        const added = prevIdx === -1 ? 1 : messages.length - 1 - prevIdx;
        if (added > 0) {
          setUnread((u) => ({ count: (u?.count ?? 0) + added, since: u?.since ?? lastMsg.created_at }));
        }
      }
    }

    prevEdges.current = { first, last };
    takeSnapshot();
  }, [messages, myId]);

  // Images/GIFs change height after load — stay pinned if we were at the bottom.
  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
      takeSnapshot();
    });
    ro.observe(content);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Infinite scroll up.
  useEffect(() => {
    const el = scrollerRef.current;
    const sentinel = topSentinelRef.current;
    if (!el || !sentinel || !initialLoaded || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadOlderMessages();
      },
      { root: el, rootMargin: "600px 0px 0px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [initialLoaded, hasMore, messages.length]);

  useEffect(() => {
    if (scrollTick > 0) scrollToBottom(false);
  }, [scrollTick, scrollToBottom]);

  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightId) {
      scrolledFor.current = null;
      return;
    }
    if (scrolledFor.current === highlightId) return;
    const node = document.getElementById(`msg-${highlightId}`);
    if (!node) return;
    scrolledFor.current = highlightId;
    stick.current = false;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, messages]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="scrollbar-thin h-full overflow-y-auto overflow-x-hidden overscroll-contain [overflow-anchor:none]"
        style={{ paddingTop: topInset }}
      >
        <div ref={contentRef} className="flex min-h-full flex-col justify-end pb-3">
          <div ref={topSentinelRef} aria-hidden="true" className="h-px" />

          {!initialLoaded ? (
            <MessageSkeleton />
          ) : hasMore ? (
            <div className="flex h-12 items-center justify-center text-zinc-500">
              {loadingOlder && <LoaderCircle className="h-5 w-5 animate-spin" />}
            </div>
          ) : (
            <ChannelIntro />
          )}

          <div role="log" aria-live="polite" aria-relevant="additions" aria-label={`Pesan di #${CHANNEL_NAME}`}>
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="mx-4 my-4 flex items-center gap-3" role="separator">
                      <span className="h-px flex-1 bg-white/[0.07]" />
                      <span className="text-[11px] font-semibold text-zinc-500">{formatDayDivider(m.created_at)}</span>
                      <span className="h-px flex-1 bg-white/[0.07]" />
                    </div>
                  )}
                  <MessageItem
                    message={m}
                    grouped={!newDay && isGrouped(prev, m)}
                    isOwn={m.user_id === myId}
                    me={me}
                    highlighted={highlightId === m.id}
                  />
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {unread && (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3" style={{ top: topInset + 8 }}>
          <div className="glass-strong pointer-events-auto flex animate-slide-up items-center overflow-hidden rounded-full text-[13px] shadow-lg shadow-black/40">
            <button type="button" onClick={() => scrollToBottom(true)} className="py-2 pl-4 pr-2 font-medium text-zinc-100 hover:bg-white/[0.04]">
              {unread.count} pesan baru sejak {formatTime(unread.since)}
            </button>
            <button type="button" onClick={() => setUnread(null)} className="py-2 pl-1 pr-3 text-zinc-400 hover:text-zinc-100" aria-label="Tandai sudah dibaca">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="glass-strong absolute bottom-3 right-4 z-20 flex h-11 w-11 animate-fade-in items-center justify-center rounded-2xl text-zinc-200 shadow-lg shadow-black/40 transition hover:text-white"
          aria-label="Lompat ke pesan terbaru"
        >
          <ArrowDown className="h-5 w-5" />
          {unread && (
            <span className="absolute -right-1.5 -top-1.5 min-w-[20px] rounded-full bg-zinc-50 px-1.5 text-center text-[11px] font-bold leading-5 text-zinc-950">
              {unread.count > 99 ? "99+" : unread.count}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

function ChannelIntro() {
  return (
    <div className="px-4 pb-4 pt-10">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/[0.08]">
        <Hash className="h-9 w-9 text-zinc-300" />
      </div>
      <h2 className="text-2xl font-bold text-zinc-50">Selamat datang di #{CHANNEL_NAME}!</h2>
      <p className="mt-1 text-sm text-zinc-500">Ini adalah awal dari channel #{CHANNEL_NAME}. Sapa semuanya 👋</p>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="space-y-5 px-4 py-4" aria-hidden="true">
      {[62, 40, 78, 30, 55, 70].map((w, i) => (
        <div key={i} className="flex animate-pulse gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-white/[0.06]" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-24 rounded-full bg-white/[0.08]" />
            <div className="h-3 rounded-full bg-white/[0.05]" style={{ width: `${w}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
