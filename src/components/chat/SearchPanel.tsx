"use client";

import { ImageIcon, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { searchMessages } from "@/lib/api";
import { jumpToMessage } from "@/lib/chat-actions";
import type { MessageRow } from "@/lib/types";
import { escapeRegExp, formatStamp, friendlyError, usernameColor } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";

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

export function SearchPanel() {
  const setPanel = useChat((s) => s.setPanel);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchMessages(q);
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
  }, [query]);

  const open = (row: MessageRow) => {
    void jumpToMessage(row);
    if (!window.matchMedia("(min-width: 1024px)").matches) setPanel(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 pl-3 pr-2">
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

      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
        {error ? (
          <p className="px-3 py-8 text-center text-sm text-red-300/90">{error}</p>
        ) : results === null ? (
          <p className="px-3 py-8 text-center text-sm text-zinc-500">Ketik minimal 2 karakter untuk mencari.</p>
        ) : results.length === 0 && !loading ? (
          <p className="px-3 py-8 text-center text-sm text-zinc-500">Tidak ada pesan yang cocok.</p>
        ) : (
          <>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{results.length} hasil</p>
            <ul className="space-y-1">
              {results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => open(row)}
                    className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
                  >
                    <Avatar username={row.username} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold" style={{ color: usernameColor(row.username) }}>
                          {row.username}
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-500">{formatStamp(row.created_at)}</span>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-zinc-300">
                        {highlight(row.content, query)}
                        {row.type !== "text" && <ImageIcon className="ml-1 inline h-3.5 w-3.5 text-zinc-500" />}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
