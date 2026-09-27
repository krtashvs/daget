"use client";

import { X } from "lucide-react";
import { useChat } from "@/store/chat";
import { usernameColor } from "@/lib/utils";
import { Avatar } from "../ui/Avatar";

export function MembersPanel() {
  const online = useChat((s) => s.online);
  const myId = useChat((s) => s.session?.userId);
  const setPanel = useChat((s) => s.setPanel);
  const typing = useChat((s) => s.typing);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between pl-5 pr-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Online <span className="text-zinc-600">—</span> <span className="tabular-nums">{online.length}</span>
        </h2>
        <button type="button" onClick={() => setPanel(null)} className="icon-btn" aria-label="Tutup">
          <X className="h-5 w-5" />
        </button>
      </div>
      <ul className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {online.length === 0 && <li className="px-3 py-6 text-center text-sm text-zinc-500">Menghubungkan…</li>}
        {online.map((u) => (
          <li key={u.userId} className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/[0.04]">
            <Avatar username={u.username} src={u.avatarUrl} size={32} online />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" style={{ color: usernameColor(u.username) }}>
                {u.username}
                {u.userId === myId && <span className="ml-1.5 text-xs font-normal text-zinc-500">(kamu)</span>}
              </p>
              {typing[u.username] && <p className="text-[11px] text-zinc-500">sedang mengetik…</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
