"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { signInWithDiscord } from "@/lib/api";
import { friendlyError } from "@/lib/utils";
import { DiscordIcon } from "./DiscordIcon";
import { Logo } from "./Logo";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 pb-safe">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.05] blur-3xl"
      />
      <div className="relative flex w-full max-w-sm animate-slide-up flex-col items-center text-center">{children}</div>
    </main>
  );
}

export function DiscordButton({ label = "Masuk dengan Discord" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInWithDiscord();
          } catch (e) {
            setError(friendlyError(e, "Gagal membuka Discord. Coba lagi."));
            setBusy(false);
          }
        }}
        className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-zinc-50 px-5 text-[15px] font-semibold text-zinc-950 shadow-xl shadow-black/40 transition hover:bg-white active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <DiscordIcon className="h-5 w-5 text-[#5865F2]" />}
        {label}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300/90">
          {error}
        </p>
      )}
    </>
  );
}

export function LoginScreen({ guildName, error }: { guildName: string | null; error?: string | null }) {
  return (
    <Shell>
      <Logo size="lg" />
      <p className="mb-10 mt-3 text-sm text-zinc-500">Ruang obrolan komunitas, live.</p>
      <DiscordButton />
      <div className="mt-4 min-h-[20px] text-sm">
        {error ? (
          <p role="alert" className="text-red-300/90">
            {error}
          </p>
        ) : (
          <p className="text-zinc-600">Khusus anggota server Discord{guildName ? ` ${guildName}` : ""}.</p>
        )}
      </div>
    </Shell>
  );
}

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <Shell>
      <Logo size="lg" />
      <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {label ?? "Memuat…"}
      </p>
    </Shell>
  );
}

export type BlockReason = "not_member" | "missing_role" | "banned" | "guild_not_configured";

const COPY: Record<BlockReason, (guild: string) => { title: string; body: string }> = {
  not_member: (g) => ({
    title: "Kamu belum join server-nya",
    body: `Daget cuma buat anggota server Discord ${g}. Join dulu, lalu masuk lagi.`,
  }),
  missing_role: (g) => ({
    title: "Belum punya akses",
    body: `Kamu sudah di server ${g}, tapi belum punya akses ke channel daget. Minta role-nya ke admin, lalu masuk lagi.`,
  }),
  banned: () => ({ title: "Akses diblokir", body: "Akun Discord kamu diblokir dari Daget oleh admin." }),
  guild_not_configured: () => ({
    title: "Belum siap",
    body: "Daget belum disambungkan ke server Discord. Hubungi admin.",
  }),
};

export function BlockedScreen({
  reason,
  guildName,
  inviteUrl,
  onSignOut,
}: {
  reason: BlockReason;
  guildName: string | null;
  inviteUrl: string | null;
  onSignOut: () => void;
}) {
  const copy = COPY[reason](guildName ?? "ini");
  return (
    <Shell>
      <Logo size="lg" />
      <div className="glass mt-8 w-full rounded-3xl p-5">
        <p className="text-base font-semibold text-zinc-100">{copy.title}</p>
        <p className="mt-1.5 text-sm text-zinc-400">{copy.body}</p>
      </div>
      <div className="mt-5 flex w-full flex-col gap-2.5">
        {(reason === "not_member" || reason === "missing_role") && inviteUrl && (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#5865F2] text-[15px] font-semibold text-white transition hover:bg-[#4752c4]"
          >
            <DiscordIcon className="h-5 w-5" />
            Join server Discord
          </a>
        )}
        {reason !== "banned" && reason !== "guild_not_configured" && <DiscordButton label="Sudah join? Masuk lagi" />}
        <button type="button" onClick={onSignOut} className="mt-1 text-sm text-zinc-500 transition hover:text-zinc-200">
          Keluar
        </button>
      </div>
    </Shell>
  );
}
