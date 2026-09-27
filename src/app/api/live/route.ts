import { NextResponse } from "next/server";
import { getPublicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

interface LiveSettings {
  youtube_channel: string | null;
  youtube_name: string | null;
  live_mode: "auto" | "on" | "off";
  live_video_id: string | null;
}

export interface LiveStatus {
  live: boolean;
  videoId: string | null;
  title: string | null;
  channelName: string | null;
  channelUrl: string | null;
  lastVideoId?: string | null;
  lastTitle?: string | null;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** "@handle", "UC…" channel id, or a full youtube.com URL → channel path ("/@handle" or "/channel/UC…"). */
function channelPath(raw: string): string | null {
  let v = raw.trim();
  try {
    if (/^https?:\/\//i.test(v)) v = new URL(v).pathname.replace(/\/(live|featured|videos|streams)\/?$/i, "");
  } catch {
    return null;
  }
  v = v.replace(/^\/+|\/+$/g, "");
  if (/^@[\w.-]{3,100}$/.test(v)) return `/${v}`;
  if (/^UC[\w-]{22}$/.test(v)) return `/channel/${v}`;
  if (/^channel\/UC[\w-]{22}$/.test(v)) return `/${v}`;
  if (/^[\w.-]{3,100}$/.test(v)) return `/@${v}`;
  return null;
}

function decodeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}

async function detect(path: string): Promise<{ live: boolean; videoId: string | null; title: string | null }> {
  const res = await fetch(`https://www.youtube.com${path}/live`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1; SOCS=CAI" },
    next: { revalidate: 25 },
  });
  if (!res.ok) return { live: false, videoId: null, title: null };
  const html = await res.text();
  const videoId = html.match(/"currentVideoEndpoint":\{[^}]*?"url":"\/watch\?v=([\w-]{11})/)?.[1] ?? null;
  const live = Boolean(videoId) && /"isLive":true/.test(html);
  const rawTitle = html.match(/"videoPrimaryInfoRenderer":\{"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)?.[1];
  return { live, videoId: live ? videoId : null, title: live && rawTitle ? decodeJsonString(rawTitle) : null };
}

/** Most recent past stream from the channel's "Live" tab (skips scheduled/upcoming ones). */
async function latestStream(path: string): Promise<{ videoId: string; title: string | null } | null> {
  const res = await fetch(`https://www.youtube.com${path}/streams`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1; SOCS=CAI" },
    next: { revalidate: 600 },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const items = html.split('"lockupViewModel":{').slice(1, 8);
  for (const item of items) {
    const videoId = item.match(/"contentId":"([\w-]{11})"/)?.[1];
    if (!videoId || /upcomingEventData|"Upcoming"|Scheduled for|UPCOMING/i.test(item)) continue;
    const rawTitle = item.match(/"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"/)?.[1];
    return { videoId, title: rawTitle ? decodeJsonString(rawTitle) : null };
  }
  return null;
}

export async function GET() {
  const off: LiveStatus = { live: false, videoId: null, title: null, channelName: null, channelUrl: null };
  const config = getPublicConfig();
  if (!config.supabaseUrl || !config.supabaseKey) return NextResponse.json(off);

  let settings: LiveSettings | null = null;
  try {
    const r = await fetch(
      `${config.supabaseUrl}/rest/v1/app_settings?id=eq.1&select=youtube_channel,youtube_name,live_mode,live_video_id`,
      { headers: { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` }, cache: "no-store" },
    );
    settings = ((await r.json()) as LiveSettings[])[0] ?? null;
  } catch {
    settings = null;
  }
  if (!settings || settings.live_mode === "off") return NextResponse.json(off);

  // One or more channels, separated by commas/spaces — the first one that is live wins.
  const paths = (settings.youtube_channel ?? "")
    .split(/[\s,]+/)
    .map(channelPath)
    .filter((p): p is string => Boolean(p));
  const base: LiveStatus = {
    ...off,
    channelName: settings.youtube_name,
    channelUrl: paths[0] ? `https://www.youtube.com${paths[0]}` : null,
  };

  const findLive = async () => {
    const results = await Promise.all(
      paths.map(async (path) => ({ path, ...(await detect(path).catch(() => ({ live: false, videoId: null, title: null }))) })),
    );
    return results.find((r) => r.live) ?? null;
  };

  let status: LiveStatus = base;
  if (settings.live_mode === "on") {
    const videoId = settings.live_video_id && /^[\w-]{11}$/.test(settings.live_video_id) ? settings.live_video_id : null;
    const found = videoId ? null : await findLive();
    status = {
      ...base,
      live: true,
      videoId: videoId ?? found?.videoId ?? null,
      title: found?.title ?? null,
      channelUrl: found ? `https://www.youtube.com${found.path}` : base.channelUrl,
    };
  } else if (paths.length) {
    const found = await findLive();
    if (found) status = { ...base, live: true, videoId: found.videoId, title: found.title, channelUrl: `https://www.youtube.com${found.path}` };
  }

  // Not live: offer the latest stream as a replay.
  if (!status.live && paths.length) {
    for (const path of paths) {
      const last = await latestStream(path).catch(() => null);
      if (last) {
        status = { ...status, lastVideoId: last.videoId, lastTitle: last.title };
        break;
      }
    }
  }

  return NextResponse.json(status, { headers: { "Cache-Control": "public, s-maxage=25, stale-while-revalidate=5" } });
}
