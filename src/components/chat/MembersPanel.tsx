"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import type { Member, RoleDef } from "@/lib/types";
import { cn, nameColor, topRole } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";

interface Row {
  id: string;
  username: string;
  avatarUrl: string | null;
  top?: RoleDef;
  online: boolean;
}

export function MembersPanel() {
  const online = useChat((s) => s.online);
  const members = useChat((s) => s.members);
  const roleDefs = useChat((s) => s.roleDefs);
  const myId = useChat((s) => s.session?.userId);
  const setPanel = useChat((s) => s.setPanel);
  const typing = useChat((s) => s.typing);

  const rows = useMemo(() => {
    const onlineIds = new Set(online.map((u) => u.userId));
    const map = new Map<string, Row>();
    for (const m of Object.values(members) as Member[]) {
      if (m.banned) continue;
      map.set(m.id, { id: m.id, username: m.username, avatarUrl: m.avatarUrl, top: topRole(m.roleIds, roleDefs), online: onlineIds.has(m.id) });
    }
    // Present in the room but not yet in the directory.
    for (const u of online) {
      if (!map.has(u.userId)) map.set(u.userId, { id: u.userId, username: u.username, avatarUrl: u.avatarUrl, online: true });
    }
    return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username, "id", { sensitivity: "base" }));
  }, [online, members, roleDefs]);

  const onlineCount = rows.filter((r) => r.online).length;

  // Like Discord: online members grouped under their highest role, then plain online, then offline.
  const groups = useMemo(() => {
    const out: { key: string; title: string; color?: string; list: Row[] }[] = [];
    const ordered = Object.values(roleDefs).sort((a, b) => b.position - a.position);
    for (const role of ordered) {
      const list = rows.filter((r) => r.online && r.top?.id === role.id);
      if (list.length) out.push({ key: role.id, title: role.name, color: role.color, list });
    }
    const plain = rows.filter((r) => r.online && !r.top);
    if (plain.length) out.push({ key: "online", title: "Online", list: plain });
    const offline = rows.filter((r) => !r.online);
    if (offline.length) out.push({ key: "offline", title: "Offline", list: offline });
    return out;
  }, [rows, roleDefs]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between pl-5 pr-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Anggota <span className="text-zinc-600">—</span> <span className="tabular-nums">{onlineCount} online</span>
        </h2>
        <button type="button" onClick={() => setPanel(null)} className="icon-btn" aria-label="Tutup">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
        {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-500">Menghubungkan…</p>}
        {groups.map(({ key, title, color, list }) => {
          return (
            <section key={key} className="mb-3">
              <h3 className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
                {title} — {list.length}
              </h3>
              <ul className="space-y-0.5">
                {list.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => useChat.getState().openProfile(u.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.04]",
                        !u.online && "opacity-45 hover:opacity-80",
                      )}
                    >
                      <Avatar username={u.username} src={u.avatarUrl} size={32} online={u.online} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate" style={{ color: nameColor(u.username, u.top?.color) }}>
                            {u.username}
                          </span>
                          {u.id === myId && <span className="shrink-0 text-xs font-normal text-zinc-500">(kamu)</span>}
                        </p>
                        {typing[u.username] && <p className="text-[11px] text-zinc-500">sedang mengetik…</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
