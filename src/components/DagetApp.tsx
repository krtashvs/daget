"use client";

import type { Session as AuthSession } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, touchMember, verifyDiscord } from "@/lib/api";
import type { PublicConfig } from "@/lib/config";
import { configureSupabase, getSupabase } from "@/lib/supabase";
import { errorCode, friendlyError } from "@/lib/utils";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useChat } from "@/store/chat";
import { ChatRoom } from "./chat/ChatRoom";
import { BlockedScreen, LoadingScreen, LoginScreen, type BlockReason } from "./LoginScreen";
import { MaintenanceScreen } from "./MaintenanceScreen";
import { Watermark } from "./Watermark";
import { Toasts } from "./ui/Toasts";

type AuthState =
  | { status: "loading" }
  | { status: "verifying" }
  | { status: "signed_out"; error?: string | null }
  | { status: "blocked"; reason: BlockReason }
  | { status: "ready" };

const BLOCK_REASONS: BlockReason[] = ["not_member", "missing_role", "banned", "guild_not_configured"];

/** Read OAuth callback details before supabase-js consumes and clears the URL. */
function readCallback(): { fresh: boolean; error: string | null } {
  if (typeof window === "undefined") return { fresh: false, error: null };
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const error = params.get("error_description") ?? params.get("error");
  return { fresh: params.has("access_token") || params.has("provider_token"), error };
}

export function DagetApp({ config }: { config: PublicConfig }) {
  const configured = Boolean(config.supabaseUrl && config.supabaseKey);
  if (configured) configureSupabase(config.supabaseUrl!, config.supabaseKey!);
  const gifSearchEnabled = config.gifSearchEnabled;

  const [callback] = useState(readCallback);
  const session = useChat((s) => s.session);
  const setSession = useChat((s) => s.setSession);
  const kickReason = useChat((s) => s.kickReason);
  const settings = useAppSettings(configured);
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const handledToken = useRef<string | null>(null);
  const freshLogin = useRef(callback.fresh);

  const handleSession = useCallback(
    async (authSession: AuthSession | null) => {
      if (!authSession) {
        handledToken.current = null;
        setSession(null);
        setAuth((a) => (a.status === "signed_out" ? a : { status: "signed_out", error: callback.error }));
        return;
      }
      if (handledToken.current === authSession.access_token) return;
      handledToken.current = authSession.access_token;
      const authId = authSession.user.id;

      // Fresh Discord login: confirm server membership with the Discord token.
      if (freshLogin.current && authSession.provider_token) {
        freshLogin.current = false;
        setAuth({ status: "verifying" });
        try {
          const result = await verifyDiscord(authSession.provider_token, authId);
          if (result.ok) {
            setSession(result.profile);
            setAuth({ status: "ready" });
          } else if ((BLOCK_REASONS as string[]).includes(result.reason)) {
            setAuth({ status: "blocked", reason: result.reason as BlockReason });
          } else {
            await signOut();
            setAuth({ status: "signed_out", error: "Verifikasi Discord gagal. Coba masuk lagi." });
          }
        } catch (error) {
          setAuth({ status: "signed_out", error: friendlyError(error, "Verifikasi Discord gagal. Coba lagi.") });
        }
        return;
      }

      // Returning visitor: the stored session is enough if the profile is still verified.
      try {
        const profile = await touchMember(authId);
        setSession(profile);
        setAuth({ status: "ready" });
      } catch (error) {
        const code = errorCode(error);
        if (code === "banned") {
          setAuth({ status: "blocked", reason: "banned" });
        } else if (code === "not_verified" || code === "not_signed_in") {
          await signOut();
          setAuth({ status: "signed_out", error: "Masuk lagi dengan Discord untuk verifikasi." });
        } else {
          handledToken.current = null;
          setAuth({ status: "signed_out", error: friendlyError(error, "Gagal memuat akun. Coba lagi.") });
        }
      }
    },
    [callback, setSession],
  );

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => handleSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void handleSession(authSession);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured, handleSession]);

  const doSignOut = useCallback(async () => {
    await signOut();
    useChat.getState().resetRoom();
    setSession(null);
    setAuth({ status: "signed_out" });
  }, [setSession]);

  useEffect(() => {
    if (!kickReason) return;
    useChat.getState().setKickReason(null);
    void signOut().finally(() => {
      setSession(null);
      setAuth({ status: "signed_out", error: kickReason });
    });
  }, [kickReason, setSession]);

  if (!configured) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-2xl p-6 text-sm text-zinc-300">
          <p className="mb-3 font-semibold text-zinc-100">Konfigurasi belum lengkap</p>
          <ul className="list-disc space-y-1 pl-5 text-red-300/90">
            {config.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </main>
    );
  }

  let screen: React.ReactNode;
  if (!settings) screen = <div className="min-h-dvh" />;
  else if (settings.maintenance) screen = <MaintenanceScreen message={settings.message} />;
  else if (auth.status === "loading") screen = <LoadingScreen />;
  else if (auth.status === "verifying") screen = <LoadingScreen label="Mengecek keanggotaan Discord…" />;
  else if (auth.status === "signed_out") screen = <LoginScreen guildName={settings.guildName} error={auth.error} />;
  else if (auth.status === "blocked")
    screen = <BlockedScreen reason={auth.reason} guildName={settings.guildName} inviteUrl={settings.inviteUrl} onSignOut={doSignOut} />;
  else if (session)
    screen = <ChatRoom key={session.userId} session={session} gifSearchEnabled={gifSearchEnabled} onSignOut={doSignOut} />;
  else screen = <LoadingScreen />;

  return (
    <>
      {screen}
      <Toasts />
      <Watermark />
    </>
  );
}
