"use client";

import { ExternalLink, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@/store/chat";

function embedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
}

function LiveDot({ replay }: { replay?: boolean }) {
  if (replay) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300">
        SIARAN ULANG
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      LIVE
    </span>
  );
}

/** What the player should show: the live stream, or the latest stream as a replay. */
export function usePlayable() {
  const live = useChat((s) => s.live);
  if (live?.live && live.videoId) return { videoId: live.videoId, title: live.title ?? "Live", replay: false, channelName: live.channelName };
  if (live?.lastVideoId) return { videoId: live.lastVideoId, title: live.lastTitle ?? "Siaran ulang", replay: true, channelName: live.channelName };
  return null;
}

function Frame({ videoId, title }: { videoId: string; title: string }) {
  return (
    <iframe
      src={embedUrl(videoId)}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      className="h-full w-full border-0"
    />
  );
}

/** Desktop: stream pane to the left of the chat. */
export function DesktopLivePane() {
  const playable = usePlayable();
  const setWatchOpen = useChat((s) => s.setWatchOpen);
  if (!playable) return null;
  const { videoId, title, replay, channelName } = playable;
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-black" aria-label="Nonton live">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
        <LiveDot replay={replay} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
          {channelName && <span className="text-zinc-400">{channelName} · </span>}
          {title}
        </p>
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="icon-btn"
          aria-label="Buka di YouTube"
          title="Buka di YouTube"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button type="button" onClick={() => setWatchOpen(false)} className="icon-btn" aria-label="Tutup live">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="aspect-video w-full max-w-[1400px] overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl">
          <Frame videoId={videoId} title={title} />
        </div>
      </div>
    </section>
  );
}

/** Mobile: player under the header, collapsible to a slim bar. Reports its height for layout. */
export function MobileLivePlayer({ top, onHeight }: { top: number; onHeight: (h: number) => void }) {
  const playable = usePlayable();
  const setWatchOpen = useChat((s) => s.setWatchOpen);
  const [minimized, setMinimized] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => {
      ro.disconnect();
      onHeight(0);
    };
  }, [onHeight]);

  if (!playable) return null;
  const { videoId, title, replay } = playable;

  return (
    <div ref={ref} className="absolute inset-x-0 z-20 border-b border-white/[0.06] bg-black" style={{ top }}>
      {/* Keep the iframe mounted while minimised so the stream keeps playing. */}
      <div className={minimized ? "h-0 overflow-hidden" : "aspect-video w-full"}>
        <Frame videoId={videoId} title={title} />
      </div>
      <div className="flex h-10 items-center gap-2 px-3">
        <LiveDot replay={replay} />
        <p className="min-w-0 flex-1 truncate text-xs text-zinc-300">{title}</p>
        <button
          type="button"
          onClick={() => setMinimized((m) => !m)}
          className="icon-btn h-8 w-8"
          aria-label={minimized ? "Besarkan player" : "Kecilkan player"}
        >
          {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => setWatchOpen(false)} className="icon-btn h-8 w-8" aria-label="Tutup live">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** "🔴 LIVE" banner shown when the channel goes live and the player is closed. */
export function LiveBanner() {
  const live = useChat((s) => s.live);
  const watchOpen = useChat((s) => s.watchOpen);
  const setWatchOpen = useChat((s) => s.setWatchOpen);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!live?.live || watchOpen || (live.videoId && dismissed === live.videoId)) return null;
  const who = live.channelName ?? "Channel";

  return (
    <div className="glass-strong pointer-events-auto flex w-full max-w-md animate-slide-up items-center gap-2 rounded-2xl py-2 pl-3 pr-1.5 text-[13px] shadow-lg shadow-black/40">
      <LiveDot />
      <p className="min-w-0 flex-1 truncate text-zinc-200">
        <span className="font-semibold">{who}</span> lagi live{live.title ? ` — ${live.title}` : ""}
      </p>
      {live.videoId ? (
        <button
          type="button"
          onClick={() => setWatchOpen(true)}
          className="shrink-0 rounded-xl bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-white"
        >
          Nonton di sini
        </button>
      ) : (
        live.channelUrl && (
          <a
            href={`${live.channelUrl}/live`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-xl bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-950"
          >
            Buka YouTube
          </a>
        )
      )}
      <button type="button" onClick={() => setDismissed(live.videoId ?? "x")} className="icon-btn h-8 w-8" aria-label="Tutup">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
