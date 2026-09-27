"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const TAPS = 7;
const TAP_GAP_MS = 1200;

interface LogoProps {
  size?: "sm" | "lg";
  className?: string;
}

export function Logo({ size = "sm", className }: LogoProps) {
  const taps = useRef({ count: 0, last: 0 });
  const [reveal, setReveal] = useState(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  }, []);

  const onClick = () => {
    const now = Date.now();
    const t = taps.current;
    t.count = now - t.last <= TAP_GAP_MS ? t.count + 1 : 1;
    t.last = now;
    if (t.count >= TAPS) {
      t.count = 0;
      setReveal(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setReveal(false), 1000);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label="Daget"
        className={cn(
          "select-none font-black leading-none tracking-[0.18em] text-zinc-50 outline-none",
          size === "lg" ? "text-5xl sm:text-6xl" : "text-[15px]",
          className,
        )}
      >
        DAGET
      </button>
      {reveal && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center animate-fade-in">
          <span className="font-mono text-sm tracking-[0.4em] text-zinc-200/90">krtashvs</span>
        </div>
      )}
    </>
  );
}
