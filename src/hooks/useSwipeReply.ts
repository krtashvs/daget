"use client";

import { useCallback, useRef } from "react";

const THRESHOLD = 56;

/**
 * Swipe a message to the LEFT to reply (touch only). Moves the bubble with the
 * finger via direct style updates (no re-render per frame) and fires once the
 * swipe passes the threshold and the finger lifts. Vertical drags scroll normally.
 */
export function useSwipeReply(onTrigger: () => void, enabled = true) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const mode = useRef<"idle" | "horizontal" | "vertical">("idle");
  const armed = useRef(false);

  const paint = useCallback((dx: number, animate: boolean) => {
    const body = bodyRef.current;
    const icon = iconRef.current;
    const transition = animate ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms" : "none";
    if (body) {
      body.style.transition = transition;
      body.style.transform = dx ? `translateX(${dx}px)` : "";
    }
    if (icon) {
      const progress = Math.min(1, -dx / THRESHOLD);
      icon.style.transition = transition;
      icon.style.opacity = String(progress);
      icon.style.transform = `translateY(-50%) scale(${0.6 + progress * 0.4})`;
    }
  }, []);

  const reset = useCallback(() => {
    start.current = null;
    mode.current = "idle";
    armed.current = false;
    paint(0, true);
  }, [paint]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      mode.current = "idle";
      armed.current = false;
    },
    [enabled],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!start.current) return;
    const t = e.touches[0];
    const mx = t.clientX - start.current.x;
    const my = t.clientY - start.current.y;
    if (mode.current === "idle") {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      mode.current = mx < 0 && Math.abs(mx) > Math.abs(my) * 1.2 ? "horizontal" : "vertical";
    }
    if (mode.current !== "horizontal") return;
    // Follow the finger, then resist past the threshold.
    const pull = Math.min(0, mx);
    const dx = pull < -THRESHOLD ? -THRESHOLD + (pull + THRESHOLD) * 0.3 : pull;
    paint(Math.max(dx, -90), false);
    const nowArmed = mx <= -THRESHOLD;
    if (nowArmed && !armed.current && "vibrate" in navigator) navigator.vibrate?.(10);
    armed.current = nowArmed;
  }, [paint]);

  const onTouchEnd = useCallback(() => {
    if (mode.current === "horizontal" && armed.current) onTrigger();
    reset();
  }, [onTrigger, reset]);

  return { bodyRef, iconRef, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset } };
}
