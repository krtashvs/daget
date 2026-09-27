"use client";

import { useCallback, useEffect, useState } from "react";
import { joinChat } from "@/lib/api";
import { clearSession, getOrCreateSecret, loadLastUsername, loadSession, saveSession } from "@/lib/session";
import type { PublicConfig } from "@/lib/config";
import { configureSupabase } from "@/lib/supabase";
import type { Session } from "@/lib/types";
import { errorCode, friendlyError } from "@/lib/utils";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useChat } from "@/store/chat";
import { ChatRoom } from "./chat/ChatRoom";
import { JoinScreen } from "./JoinScreen";
import { MaintenanceScreen } from "./MaintenanceScreen";
import { Watermark } from "./Watermark";
import { Toasts } from "./ui/Toasts";

type View = "boot" | "join" | "rename" | "chat";

export function DagetApp({ config }: { config: PublicConfig }) {
  const configured = Boolean(config.supabaseUrl && config.supabaseKey);
  if (configured) configureSupabase(config.supabaseUrl!, config.supabaseKey!);
  const gifSearchEnabled = config.gifSearchEnabled;

  const session = useChat((s) => s.session);
  const setSession = useChat((s) => s.setSession);
  const [view, setView] = useState<View>("boot");
  const [joinError, setJoinError] = useState<string | null>(null);
  const kickReason = useChat((s) => s.kickReason);
  const settings = useAppSettings(configured);

  useEffect(() => {
    if (!kickReason) return;
    clearSession();
    setSession(null);
    setJoinError(kickReason);
    setView("join");
    useChat.getState().setKickReason(null);
  }, [kickReason, setSession]);

  useEffect(() => {
    if (!configured) return;
    const stored = loadSession();
    if (!stored) {
      setView("join");
      return;
    }
    setSession(stored);
    setView("chat");

    // Re-validate in the background: refreshes last_seen and recovers if the DB was reset.
    joinChat(stored.username, stored.secret)
      .then((res) => {
        const next = { ...stored, userId: res.id, username: res.username };
        saveSession(next);
        if (res.id !== stored.userId || res.username !== stored.username) setSession(next);
      })
      .catch((error) => {
        if (errorCode(error) === "username_taken" || errorCode(error) === "invalid_username") {
          clearSession();
          setSession(null);
          setJoinError(friendlyError(error));
          setView("join");
        }
      });
  }, [configured, setSession]);

  const submitUsername = useCallback(
    async (username: string) => {
      const secret = getOrCreateSecret();
      const res = await joinChat(username, secret);
      const next: Session = { userId: res.id, username: res.username, secret };
      saveSession(next);
      setSession(next);
      setJoinError(null);
      setView("chat");
    },
    [setSession],
  );

  if (!configured) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-2xl p-6 text-sm text-zinc-300">
          <p className="mb-3 font-semibold text-zinc-100">Konfigurasi belum lengkap</p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-red-300/90">
            {config.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <ol className="list-decimal space-y-1.5 pl-5 text-zinc-400">
            <li>
              Vercel → Project → <b className="text-zinc-200">Settings → Environment Variables</b>.
            </li>
            <li>
              Tambahkan <code className="text-zinc-100">NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
              <code className="text-zinc-100">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (centang Production, Preview, Development).
            </li>
            <li>
              Buka tab <b className="text-zinc-200">Deployments</b> → deployment terbaru → <b className="text-zinc-200">⋯ → Redeploy</b>.
            </li>
          </ol>
        </div>
      </main>
    );
  }

  if (settings?.maintenance) {
    return (
      <>
        <MaintenanceScreen message={settings.message} />
        <Watermark />
      </>
    );
  }

  return (
    <>
      {(view === "boot" || !settings) && <div className="min-h-dvh" />}
      {settings && (view === "join" || view === "rename") && (
        <JoinScreen
          mode={view}
          initialUsername={view === "rename" ? session?.username ?? "" : loadLastUsername()}
          initialError={joinError}
          onSubmit={submitUsername}
          onCancel={view === "rename" ? () => setView("chat") : undefined}
        />
      )}
      {settings && view === "chat" && session && (
        <ChatRoom key={`${session.userId}:${session.username}`} session={session} gifSearchEnabled={gifSearchEnabled} onRename={() => setView("rename")} />
      )}
      <Toasts />
      <Watermark />
    </>
  );
}
