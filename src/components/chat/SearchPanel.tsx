"use client";

import { AtSign, ChevronDown, ImageIcon, Link2, LoaderCircle, Mic, Search, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { searchMessagesAdvanced, type SearchHas } from "@/lib/api";
import { jumpToMessage } from "@/lib/chat-actions";
import type { Member, MessageRow } from "@/lib/types";
import { cn, escapeRegExp, formatStamp, friendlyError, mediaLabel, memberColor } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";

const HAS_OPTIONS: { value: SearchHas | null; label: string }[] = [
  { value: null, label: "Semua" },
  { value: "media", label: "Semua media" },
  { value: "image", label: "Gambar" },
  { value: "gif", label: "GIF" },
  { value: "voice", label: "Pesan suara" },
  { value: "link", label: "Link" },
];

type Picker = "from" | "mentions" | "has" | null;

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-white/20 px-0.5 text-white">
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

function formatClock(ms?: number | null) {
  const total = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function FilterChip({
  icon,
  label,
  value,
  active,
  open,
  onClick,
  onClear,
}: {
  icon: ReactNode;
  label: string;
  value?: string | null;
  active: boolean;
  open: boolean;
  onClick: () => void;
  onClear: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 max-w-full items-center overflow-hidden rounded-full text-xs font-medium ring-1 ring-inset transition",
        active ? "bg-white/[0.12] text-zinc-50 ring-white/20" : "bg-white/[0.04] text-zinc-400 ring-white/[0.08]",
        open && "ring-white/40",
      )}
    >
      <button type="button" onClick={onClick} className="inline-flex min-w-0 items-center gap-1.5 pl-3 pr-2 hover:text-zinc-100">
        {icon}
        <span className="shrink-0">{label}</span>
        {value && <span className="truncate font-semibold">{value}</span>}
        {!active && <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>
      {active && (
        <button type="button" onClick={onClear} className="pr-2 text-zinc-400 hover:text-zinc-100" aria-label={`Hapus filter ${label}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

function MemberPicker({ onPick }: { onPick: (m: Member) => void }) {
  const members = useChat((s) => s.members);
  const roleDefs = useChat((s) => s.roleDefs);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(members)
      .filter((m) => !needle || m.username.toLowerCase().includes(needle) || m.handle?.toLowerCase().includes(needle))
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, 40);
  }, [members, q]);

  return (
    <div className="mt-2 overflow-hidden rounded-2xl bg-black/30 ring-1 ring-inset ring-white/[0.06]">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari anggota…"
        className="h-10 w-full border-b border-white/[0.05] bg-transparent px-3 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none sm:text-sm"
      />
      <ul className="scrollbar-thin max-h-56 overflow-y-auto p-1">
        {list.length === 0 && <li className="px-3 py-4 text-center text-xs text-zinc-500">Tidak ada anggota.</li>}
        {list.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onPick(m)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-white/[0.06]"
            >
              <Avatar username={m.username} src={m.avatarUrl} size={24} />
              <span className="truncate font-medium" style={{ color: memberColor(m.username, m.roleIds, roleDefs) }}>
                {m.username}
              </span>
              {m.handle && <span className="ml-auto truncate pl-2 text-xs text-zinc-500">@{m.handle}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SearchPanel() {
  const setPanel = useChat((s) => s.setPanel);
  const members = useChat((s) => s.members);
  const roleDefs = useChat((s) => s.roleDefs);
  const preset = useChat((s) => s.searchPreset);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [mentions, setMentions] = useState<string | null>(null);
  const [has, setHas] = useState<SearchHas | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [results, setResults] = useState<MessageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filters requested from a profile card ("Pesannya" / "Yang menyebut").
  useEffect(() => {
    if (!preset) return;
    setFrom(preset.from ?? null);
    setMentions(preset.mentions ?? null);
    setHas(null);
    setQuery("");
    setPicker(null);
    useChat.getState().clearSearchPreset();
  }, [preset]);

  useEffect(() => {
    if (!useChat.getState().searchPreset && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const hasFilter = Boolean(from || mentions || has);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2 && !hasFilter) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchMessagesAdvanced({ query: q.length >= 2 ? q : "", from, mentions, has });
        if (!cancelled) {
          setResults(rows);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "Pencarian gagal."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, from, mentions, has, hasFilter]);

  const open = (row: MessageRow) => {
    void jumpToMessage(row);
    if (!window.matchMedia("(min-width: 1024px)").matches) setPanel(null);
  };

  const fromMember = from ? members[from] : undefined;
  const mentionsMember = mentions ? members[mentions] : undefined;
  const hasLabel = HAS_OPTIONS.find((o) => o.value === has)?.label;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pb-2 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-white/[0.05] px-3 ring-1 ring-inset ring-white/[0.06] focus-within:ring-white/20">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari pesan"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none sm:text-sm"
            />
            {loading && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-zinc-500" />}
          </div>
          <button type="button" onClick={() => setPanel(null)} className="icon-btn" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <FilterChip
            icon={<UserRound className="h-3.5 w-3.5 shrink-0" />}
            label="Dari"
            value={fromMember?.username}
            active={Boolean(from)}
            open={picker === "from"}
            onClick={() => setPicker((p) => (p === "from" ? null : "from"))}
            onClear={() => setFrom(null)}
          />
          <FilterChip
            icon={<AtSign className="h-3.5 w-3.5 shrink-0" />}
            label="Menyebut"
            value={mentionsMember?.username}
            active={Boolean(mentions)}
            open={picker === "mentions"}
            onClick={() => setPicker((p) => (p === "mentions" ? null : "mentions"))}
            onClear={() => setMentions(null)}
          />
          <FilterChip
            icon={<ImageIcon className="h-3.5 w-3.5 shrink-0" />}
            label="Jenis"
            value={has ? hasLabel : null}
            active={Boolean(has)}
            open={picker === "has"}
            onClick={() => setPicker((p) => (p === "has" ? null : "has"))}
            onClear={() => setHas(null)}
          />
        </div>

        {(picker === "from" || picker === "mentions") && (
          <MemberPicker
            onPick={(m) => {
              if (picker === "from") setFrom(m.id);
              else setMentions(m.id);
              setPicker(null);
            }}
          />
        )}
        {picker === "has" && (
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-2xl bg-black/30 p-2 ring-1 ring-inset ring-white/[0.06]">
            {HAS_OPTIONS.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => {
                  setHas(o.value);
                  setPicker(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  has === o.value ? "bg-zinc-50 text-zinc-950" : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
        {error ? (
          <p className="px-3 py-8 text-center text-sm text-red-300/90">{error}</p>
        ) : results === null ? (
          <p className="px-3 py-8 text-center text-sm text-zinc-500">Ketik kata kunci, atau pilih filter Dari / Menyebut / Jenis.</p>
        ) : results.length === 0 && !loading ? (
          <p className="px-3 py-8 text-center text-sm text-zinc-500">Tidak ada pesan yang cocok.</p>
        ) : (
          <>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{results.length} hasil</p>
            <ul className="space-y-1">
              {results.map((row) => {
                const author = row.user_id ? members[row.user_id] : undefined;
                const name = author?.username ?? row.username;
                return (
                  <li key={row.id}>
                    <button type="button" onClick={() => open(row)} className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.05]">
                      <Avatar username={name} src={author?.avatarUrl ?? row.avatar_url} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-semibold" style={{ color: memberColor(name, author?.roleIds, roleDefs) }}>
                            {name}
                          </span>
                          <span className="shrink-0 text-[11px] text-zinc-500">{formatStamp(row.created_at)}</span>
                        </div>
                        {row.content && (
                          <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-zinc-300">{highlight(row.content, q)}</p>
                        )}
                        {(row.type === "image" || row.type === "gif") && row.media_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.media_url} alt={mediaLabel(row.type)} loading="lazy" className="mt-1.5 max-h-32 rounded-lg object-cover ring-1 ring-white/10" />
                        )}
                        {row.type === "voice" && (
                          <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1 text-xs text-zinc-400">
                            <Mic className="h-3.5 w-3.5" /> Pesan suara · {formatClock(row.duration_ms)}
                          </p>
                        )}
                        {row.type === "text" && has === "link" && <Link2 className="mt-1 h-3.5 w-3.5 text-zinc-500" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
