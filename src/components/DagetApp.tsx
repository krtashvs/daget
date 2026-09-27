"use client";

import { useCallback, useEffect, useState } from "react";
import { joinChat } from "@/lib/api";
import { clearSession, getOrCreateSecret, loadLastUsername, loadSession, saveSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Session } from "@/lib/types";
import { errorCode, friendlyError } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { ChatRoom } from "./chat/ChatRoom";
import { JoinScreen } from "./JoinScreen";
import { Watermark } from "./Watermark";
import { Toasts } from "./ui/Toasts";

type View = "boot" | "join" | "rename" | "chat";

export function DagetApp({ gifSearchEnabled }: { gifSearchEnabled: boolean }) {
  const session = useChat((s) => s.session);
  const setSession = useChat((s) => s.setSession);
  const [view, setView] = useState<View>("boot");
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
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
  }, [setSession]);

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

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="glass max-w-md rounded-2xl p-6 text-sm text-zinc-300">
          <p className="mb-2 font-semibold text-zinc-100">Konfigurasi belum lengkap</p>
          <p>
            Isi <code className="text-zinc-100">NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
            <code className="text-zinc-100">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> pada environment variables, lalu jalankan ulang
            aplikasi. Lihat README untuk panduan lengkap.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      {view === "boot" && <div className="min-h-dvh" />}
      {(view === "join" || view === "rename") && (
        <JoinScreen
          mode={view}
          initialUsername={view === "rename" ? session?.username ?? "" : loadLastUsername()}
          initialError={joinError}
          onSubmit={submitUsername}
          onCancel={view === "rename" ? () => setView("chat") : undefined}
        />
      )}
      {view === "chat" && session && (
        <ChatRoom key={`${session.userId}:${session.username}`} session={session} gifSearchEnabled={gifSearchEnabled} onRename={() => setView("rename")} />
      )}
      <Toasts />
      <Watermark />
    </>
  );
}
