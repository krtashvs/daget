"use client";

import { useEffect } from "react";
import type { LiveStatus } from "@/lib/types";
import { useChat } from "@/store/chat";

const POLL_MS = 60_000;

/** Polls /api/live (cached at the edge for 60 s) and keeps the store in sync. */
export function useLiveStatus() {
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) return;
        const status = (await res.json()) as LiveStatus;
        if (alive) useChat.getState().setLive(status);
      } catch {
        /* keep last known status */
      }
    };
    void load();
    const timer = window.setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
