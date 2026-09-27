"use client";

import { Ellipsis, Hash, LogOut, Search, UserRound, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CHANNEL_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { Logo } from "../Logo";
import { Avatar } from "../ui/Avatar";
import { RoleBadge } from "../ui/RoleBadge";

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
          <span className="ml-2 hidden items-center gap-1.5 text-xs text-zinc-500 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {onlineCount} online
          </span>
        </div>

        <div className="ml-auto flex items-center">
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
                      <RoleBadge role={profile?.role} />
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
