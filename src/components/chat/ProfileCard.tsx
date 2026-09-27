"use client";

import { AtSign, Ban, ExternalLink, LoaderCircle, MessageSquareText, Search, Shield, ShieldOff, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getProfile, setMemberBanned, setMemberRole } from "@/lib/api";
import { refreshMembers } from "@/lib/chat-actions";
import type { ProfileDetails, Role } from "@/lib/types";
import { cn, formatLongDate, friendlyError, nameColor, snowflakeDate } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { RoleBadge } from "../ui/RoleBadge";
import { useEscape } from "../ui/useEscape";

function bannerStyle(p: ProfileDetails | null): React.CSSProperties {
  if (p?.banner_url) return { backgroundImage: `url(${p.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" };
  if (p?.accent_color != null) return { backgroundColor: `#${p.accent_color.toString(16).padStart(6, "0")}` };
  return { backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))" };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-200">{value}</span>
    </div>
  );
}

/** Discord-style profile card. Bottom sheet on mobile, centred card on desktop. */
export function ProfileCard() {
  const userId = useChat((s) => s.profileUserId);
  const me = useChat((s) => s.session);
  const online = useChat((s) => s.online);
  const close = useCallback(() => useChat.getState().openProfile(null), []);
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEscape(Boolean(userId), close);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setProfile(null);
    setError(null);
    getProfile(userId)
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setError(friendlyError(e, "Gagal memuat profil.")));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!userId) return null;

  const isOnline = online.some((u) => u.userId === userId);
  const isSelf = me?.userId === userId;
  const myRole = me?.role ?? "member";
  const canManageRoles = myRole === "admin" && !isSelf && profile?.is_discord;
  const canBan = (myRole === "admin" || myRole === "mod") && !isSelf && profile?.role === "member" && profile?.is_discord;

  const run = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await fn();
      const fresh = await getProfile(userId);
      setProfile(fresh);
      void refreshMembers();
      useChat.getState().pushToast(done);
    } catch (e) {
      useChat.getState().pushToast(friendlyError(e, "Gagal menyimpan perubahan."));
    } finally {
      setBusy(null);
    }
  };

  const changeRole = (role: Role) =>
    run(`role:${role}`, () => setMemberRole(userId, role), role === "mod" ? "Dijadikan Moderator." : role === "admin" ? "Dijadikan Admin." : "Role dicabut.");

  const mention = () => {
    if (!profile?.discord_username) return;
    const el = document.getElementById("composer") as HTMLTextAreaElement | null;
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      const next = `${el.value}${el.value && !el.value.endsWith(" ") ? " " : ""}@${profile.discord_username} `;
      setter?.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if (window.matchMedia("(pointer: fine)").matches) el.focus();
    }
    close();
  };

  const discordSince = snowflakeDate(profile?.discord_id);

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Profil">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="glass-strong relative w-full animate-sheet-up overflow-hidden rounded-t-3xl bg-ink-850/95 pb-[max(var(--safe-bottom),16px)] shadow-2xl sm:max-w-sm sm:animate-slide-up sm:rounded-3xl sm:pb-4">
        <div className="relative h-28" style={bannerStyle(profile)}>
          <button type="button" onClick={close} className="icon-btn absolute right-2 top-2 bg-black/40 text-zinc-100 backdrop-blur" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5">
          <div className="-mt-11 flex items-end justify-between">
            <div className="rounded-full bg-ink-850 p-1.5">
              <Avatar username={profile?.username ?? "…"} src={profile?.avatar_url} size={80} online={isOnline} />
            </div>
            {profile?.discord_id && (
              <a
                href={`https://discord.com/users/${profile.discord_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-1 inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.1]"
              >
                Profil Discord <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {!profile && !error && (
            <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat profil…
            </div>
          )}
          {error && <p className="py-8 text-sm text-red-300/90">{error}</p>}

          {profile && (
            <>
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold" style={{ color: nameColor(profile.username, profile.role) }}>
                    {profile.username}
                  </h2>
                  <RoleBadge role={profile.role} />
                  {profile.banned && (
                    <span className="rounded-md bg-red-500/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-red-300 ring-1 ring-inset ring-red-400/25">
                      DIBLOKIR
                    </span>
                  )}
                </div>
                {profile.discord_username && <p className="text-sm text-zinc-400">@{profile.discord_username}</p>}
                <p className="mt-1 text-xs text-zinc-500">{isOnline ? "🟢 Online sekarang" : `Terakhir aktif ${formatLongDate(profile.last_seen)}`}</p>
              </div>

              <div className="mt-4 divide-y divide-white/[0.05] rounded-2xl bg-black/25 px-4 py-1 ring-1 ring-inset ring-white/[0.05]">
                {discordSince && <Row label="Akun Discord sejak" value={formatLongDate(discordSince)} />}
                {profile.guild_joined_at && <Row label="Join server Discord" value={formatLongDate(profile.guild_joined_at)} />}
                <Row label="Join Daget" value={formatLongDate(profile.created_at)} />
                <Row label="Pesan dikirim" value={profile.message_count.toLocaleString("id-ID")} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => useChat.getState().openSearchWith({ from: profile.id })}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.1]"
                >
                  <MessageSquareText className="h-4 w-4" /> Pesannya
                </button>
                <button
                  type="button"
                  onClick={() => useChat.getState().openSearchWith({ mentions: profile.id })}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.1]"
                >
                  <Search className="h-4 w-4" /> Yang menyebut
                </button>
                {!isSelf && profile.discord_username && (
                  <button
                    type="button"
                    onClick={mention}
                    className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-zinc-50 text-[13px] font-semibold text-zinc-950 transition hover:bg-white"
                  >
                    <AtSign className="h-4 w-4" /> Mention
                  </button>
                )}
              </div>

              {(canManageRoles || canBan) && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Moderasi</p>
                  <div className="flex flex-wrap gap-2">
                    {canManageRoles && profile.role !== "mod" && (
                      <ModButton busy={busy === "role:mod"} onClick={() => changeRole("mod")} icon={<Shield className="h-4 w-4" />} label="Jadikan Moderator" />
                    )}
                    {canManageRoles && profile.role !== "admin" && (
                      <ModButton busy={busy === "role:admin"} onClick={() => changeRole("admin")} icon={<Shield className="h-4 w-4" />} label="Jadikan Admin" />
                    )}
                    {canManageRoles && profile.role !== "member" && (
                      <ModButton busy={busy === "role:member"} onClick={() => changeRole("member")} icon={<ShieldOff className="h-4 w-4" />} label="Cabut Role" />
                    )}
                    {canBan && (
                      <ModButton
                        busy={busy === "ban"}
                        danger={!profile.banned}
                        onClick={() =>
                          run("ban", () => setMemberBanned(profile.id, !profile.banned), profile.banned ? "Blokir dibuka." : "Anggota diblokir.")
                        }
                        icon={<Ban className="h-4 w-4" />}
                        label={profile.banned ? "Buka Blokir" : "Blokir"}
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModButton({
  label,
  icon,
  onClick,
  busy,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold ring-1 ring-inset transition disabled:opacity-60",
        danger ? "bg-red-500/10 text-red-300 ring-red-400/20 hover:bg-red-500/20" : "bg-white/[0.04] text-zinc-200 ring-white/[0.08] hover:bg-white/[0.08]",
      )}
    >
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
