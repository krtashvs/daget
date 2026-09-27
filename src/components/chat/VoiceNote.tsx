"use client";

import { LoaderCircle, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const BARS = 32;
let playing: HTMLAudioElement | null = null;

function formatClock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Deterministic pseudo-waveform so every voice note has its own shape. */
function waveform(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ i;
    const r = ((h >>> 0) % 1000) / 1000;
    const envelope = Math.sin((Math.PI * (i + 1)) / (BARS + 1));
    return 0.2 + 0.8 * (0.35 * envelope + 0.65 * r);
  });
}

interface VoiceNoteProps {
  id: string;
  src: string;
  durationMs?: number | null;
  sending?: boolean;
}

export function VoiceNote({ id, src, durationMs, sending }: VoiceNoteProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const bars = useMemo(() => waveform(id), [id]);
  const total = durationMs && durationMs > 0 ? durationMs : 0;

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        if (playing === audio) playing = null;
      }
    },
    [],
  );

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.addEventListener("timeupdate", () => setPosition(audio.currentTime * 1000));
    audio.addEventListener("playing", () => setLoading(false));
    audio.addEventListener("waiting", () => setLoading(true));
    audio.addEventListener("pause", () => setIsPlaying(false));
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setPosition(0);
    });
    audio.addEventListener("error", () => {
      setFailed(true);
      setLoading(false);
      setIsPlaying(false);
    });
    audioRef.current = audio;
    return audio;
  };

  const toggle = async () => {
    if (sending || failed) return;
    const audio = ensureAudio();
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    setLoading(true);
    setIsPlaying(true);
    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
      setLoading(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!total || sending || failed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const audio = ensureAudio();
    audio.currentTime = (ratio * total) / 1000;
    setPosition(ratio * total);
  };

  const progress = total ? Math.min(1, position / total) : 0;
  const shown = isPlaying || position > 0 ? position : total;

  return (
    <div className="mt-1.5 inline-flex w-full max-w-[300px] items-center gap-3 rounded-2xl bg-white/[0.05] py-2 pl-2 pr-3.5 ring-1 ring-inset ring-white/[0.07]">
      <button
        type="button"
        onClick={toggle}
        disabled={sending || failed}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-50 text-zinc-950 transition active:scale-95 disabled:bg-white/20 disabled:text-zinc-400"
        aria-label={isPlaying ? "Jeda pesan suara" : "Putar pesan suara"}
      >
        {sending || (loading && isPlaying) ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        )}
      </button>
      <div className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[2px]" onClick={seek} role="presentation">
        {bars.map((h, i) => (
          <span
            key={i}
            className={cn("w-[3px] flex-1 rounded-full transition-colors", i / BARS < progress ? "bg-zinc-100" : "bg-white/25")}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        ))}
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">
        {failed ? "Error" : formatClock(shown)}
      </span>
    </div>
  );
}
