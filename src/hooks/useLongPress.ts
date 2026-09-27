"use client";

import { useCallback, useRef } from "react";

/** Touch long-press (for mobile message actions). Cancels on scroll/move. */
export function useLongPress(onLongPress: () => void, delay = 450) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      fired.current = false;
      origin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        if ("vibrate" in navigator) navigator.vibrate?.(8);
        onLongPress();
      }, delay);
    },
    [delay, onLongPress],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!origin.current) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - origin.current.x) > 10 || Math.abs(t.clientY - origin.current.y) > 10) clear();
    },
    [clear],
  );

  /** Swallow the click that follows a long-press so it doesn't open links/images. */
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (fired.current) {
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    }
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd: clear, onTouchCancel: clear, onClickCapture };
}
