"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GifResult } from "@/lib/types";

export function GifPanel({ onPick }: { onPick: (gif: GifResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        setError(false);
        try {
          const res = await fetch(`/api/gifs?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
          if (!res.ok) throw new Error(String(res.status));
          const json = (await res.json()) as { results: GifResult[] };
          setResults(json.results);
        } catch (e) {
          if ((e as Error).name !== "AbortError") setError(true);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query ? 350 : 0,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const left = results.filter((_, i) => i % 2 === 0);
  const right = results.filter((_, i) => i % 2 === 1);

  return (
    <div className="flex h-[360px] flex-col">
      <div className="p-2">
        <div className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.05] px-3 ring-1 ring-inset ring-white/[0.06] focus-within:ring-white/20">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari GIF"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none sm:text-sm"
          />
          {loading && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-zinc-500" />}
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2">
        {error ? (
          <p className="py-10 text-center text-sm text-zinc-500">Gagal memuat GIF.</p>
        ) : !loading && results.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">Tidak ada GIF ditemukan.</p>
        ) : (
          <div className="flex gap-1.5">
            {[left, right].map((col, c) => (
              <div key={c} className="flex flex-1 flex-col gap-1.5">
                {col.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => onPick(gif)}
                    className="overflow-hidden rounded-lg bg-white/[0.04] ring-white/40 transition hover:ring-2 focus-visible:outline-none focus-visible:ring-2"
                    style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                    title={gif.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={gif.preview} alt={gif.title} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="border-t border-white/[0.05] py-1.5 text-center text-[10px] uppercase tracking-widest text-zinc-600">Powered by GIPHY</p>
    </div>
  );
}
