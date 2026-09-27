"use client";

import { Bell, BellOff, Ellipsis, Hash, LogOut, RefreshCw, Search, Tv, UserRound, Users } from "lucide-react";
import { notificationsEnabled, notificationsSupported, setNotifications } from "@/lib/notify";
import { signInWithDiscord } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { CHANNEL_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { Logo } from "../Logo";
import { Avatar } from "../ui/Avatar";

interface ChatHeaderProps {
  onSignOut: () => void;
  onHeight: (height: number) => void;
}

export function ChatHeader({ onSignOut, onHeight }: ChatHeaderProps) {
  const panel = useChat((s) => s.panel);
  const togglePanel = useChat((s) => s.togglePanel);
  const onlineCount = useChat((s) => s.online.length);
  const profile = useChat((s) => s.session);
  const username = profile?.username ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  useEffect(() => setNotifyOn(notificationsEnabled()), []);

  const toggleNotify = async () => {
    if (!notifyOn && !notificationsSupported()) {
      useChat
        .getState()
        .pushToast("Browser ini belum mendukung notifikasi. Di iPhone, tambahkan Daget ke Home Screen dulu (Share → Add to Home Screen).");
      return;
    }
    const on = await setNotifications(!notifyOn);
    setNotifyOn(on);
    useChat
      .getState()
      .pushToast(on ? "Notifikasi mention nyala 🔔" : notifyOn ? "Notifikasi mention dimatikan." : "Izin notifikasi ditolak di browser.");
  };
  const liveVideo = useChat((s) => (s.live?.live ? s.live.videoId : null));
  const watchOpen = useChat((s) => s.watchOpen);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header ref={headerRef} className="glass absolute inset-x-0 top-0 z-30 border-x-0 border-t-0 pt-safe">
      <div className="flex h-14 items-center gap-3 pl-4 pr-2">
        <Logo />
        <span className="h-5 w-px bg-white/10" aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-1">
          <Hash className="h-[18px] w-[18px] shrink-0 text-zinc-500" />
          <h1 className="truncate text-[15px] font-semibold text-zinc-100">{CHANNEL_NAME}</h1>
          <span className={cn("ml-2 hidden items-center gap-1.5 whitespace-nowrap text-xs text-zinc-500", !watchOpen && "sm:inline-flex")}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {onlineCount} online
          </span>
        </div>

        <div className="ml-auto flex items-center">
          {liveVideo && (
            <button
              type="button"
              onClick={() => useChat.getState().setWatchOpen(!watchOpen)}
              className={cn("icon-btn relative w-auto gap-1.5 px-2 text-red-400 hover:text-red-300", watchOpen && "bg-red-500/15")}
              aria-label={watchOpen ? "Tutup live" : "Nonton live"}
              aria-pressed={watchOpen}
              title="Nonton live"
            >
              <Tv className="h-5 w-5" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            </button>
          )}
          <button
            type="button"
            onClick={() => togglePanel("search")}
            className={cn("icon-btn", panel === "search" && "bg-white/[0.08] text-zinc-100")}
            aria-label="Cari pesan"
            aria-pressed={panel === "search"}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => togglePanel("members")}
            className={cn("icon-btn relative w-auto gap-1 px-2", panel === "members" && "bg-white/[0.08] text-zinc-100")}
            aria-label={`Pengguna online (${onlineCount})`}
            aria-pressed={panel === "members"}
          >
            <Users className="h-5 w-5" />
            <span className="text-xs font-semibold tabular-nums">{onlineCount}</span>
          </button>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className={cn("icon-btn", menuOpen && "bg-white/[0.08] text-zinc-100")}
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Ellipsis className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div role="menu" className="glass-strong absolute right-0 top-full mt-2 w-60 animate-slide-up overflow-hidden rounded-2xl p-1.5 shadow-2xl shadow-black/50">
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar username={username} src={profile?.avatarUrl} size={32} online />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 truncate text-sm font-semibold text-zinc-100">
                      {username}
                    </p>
                    {profile?.handle && <p className="truncate text-[11px] text-zinc-500">@{profile.handle} · Discord</p>}
                  </div>
                </div>
                <div className="my-1 h-px bg-white/[0.06]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    if (profile) useChat.getState().openProfile(profile.userId);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
                >
                  <UserRound className="h-4 w-4 text-zinc-400" />
                  Profil Saya
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void signInWithDiscord();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
                >
                  <RefreshCw className="h-4 w-4 text-zinc-400" />
                  Sinkronkan Role Discord
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={notifyOn}
                  onClick={() => void toggleNotify()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
                >
                  {notifyOn ? <Bell className="h-4 w-4 text-zinc-400" /> : <BellOff className="h-4 w-4 text-zinc-400" />}
                  <span className="flex-1">Notifikasi mention</span>
                  <span className={cn("text-xs font-semibold", notifyOn ? "text-emerald-300" : "text-zinc-500")}>{notifyOn ? "ON" : "OFF"}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm text-red-300 transition hover:bg-white/[0.06]"
                >
                  <LogOut className="h-4 w-4" />
                  Keluar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
