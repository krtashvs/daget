import { NextResponse, type NextRequest } from "next/server";
import type { GifResult } from "@/lib/types";

interface GiphyImage {
  url?: string;
  width?: string;
  height?: string;
}

interface GiphyGif {
  id: string;
  title?: string;
  images?: Record<string, GiphyImage | undefined>;
}

function stripQuery(url: string): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

function toResult(g: GiphyGif): GifResult | null {
  const send = g.images?.downsized_medium ?? g.images?.fixed_height ?? g.images?.original;
  const preview = g.images?.fixed_width_downsampled ?? g.images?.fixed_width ?? send;
  if (!send?.url || !preview?.url) return null;
  const url = stripQuery(send.url);
  if (!/^https:\/\/(media[0-9]*|i)\.giphy\.com\/[A-Za-z0-9/_.-]+$/.test(url)) return null;
  return {
    id: g.id,
    title: g.title ?? "GIF",
    preview: stripQuery(preview.url),
    url,
    width: Number(preview.width) || 200,
    height: Number(preview.height) || 200,
  };
}

export async function GET(req: NextRequest) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return NextResponse.json({ error: "gif_search_disabled" }, { status: 501 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  const endpoint = q ? "search" : "trending";
  const params = new URLSearchParams({ api_key: key, limit: "30", rating: "pg-13", bundle: "messaging_non_clips" });
  if (q) {
    params.set("q", q);
    params.set("lang", "id");
  }

  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`, { next: { revalidate: q ? 600 : 300 } });
    if (!res.ok) return NextResponse.json({ error: "upstream_error" }, { status: 502 });
    const json = (await res.json()) as { data?: GiphyGif[] };
    const results = (json.data ?? []).map(toResult).filter((r): r is GifResult => r !== null);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
