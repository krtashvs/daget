"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, fetchAppSettings, type AppSettings } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

/** Live app settings (maintenance mode). `null` until the first load finishes. */
export function useAppSettings(enabled: boolean): AppSettings | null {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      fetchAppSettings().then((s) => {
        if (alive) setSettings(s);
      });

    void load();
    // Never block the app for long if the settings request is slow.
    const fallback = window.setTimeout(() => {
      if (alive) setSettings((s) => s ?? DEFAULT_SETTINGS);
    }, 4000);

    const channel = getSupabase()
      .channel("app:settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => void load())
      .subscribe();

    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(load, 60_000);

    return () => {
      alive = false;
      window.clearTimeout(fallback);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      void getSupabase().removeChannel(channel);
    };
  }, [enabled]);

  return settings;
}
