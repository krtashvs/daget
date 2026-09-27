import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN } from "./constants";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Returns an error message, or null if the username is valid. */
export function validateUsername(raw: string): string | null {
  const name = normalizeUsername(raw);
  if (name.length < USERNAME_MIN) return `Username minimal ${USERNAME_MIN} karakter.`;
  if (name.length > USERNAME_MAX) return `Username maksimal ${USERNAME_MAX} karakter.`;
  if (!USERNAME_PATTERN.test(name)) return "Gunakan huruf, angka, spasi, titik, garis bawah, atau strip.";
  return null;
}

function hashString(input: string): number {
  let hash = 2166136261;
  const s = input.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Soft pastel colour for a username, stable across sessions. */
export function usernameColor(username: string): string {
  const hue = hashString(username) % 360;
  return `hsl(${hue} 70% 78%)`;
}

export function avatarGradient(username: string): string {
  const h = hashString(username);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 50)) % 360;
  return `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${hue2} 50% 20%))`;
}

export function initials(username: string): string {
  const parts = username.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "16.29" (today), "Kemarin 16.29", or "25/09/2026 16.29" — Discord-style relative stamp. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  if (day === today) return timeFmt.format(d);
  if (day === today - 86_400_000) return `Kemarin ${timeFmt.format(d)}`;
  return `${shortDateFmt.format(d)} ${timeFmt.format(d)}`;
}

export function formatDayDivider(iso: string): string {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  if (day === today) return "Hari ini";
  if (day === today - 86_400_000) return "Kemarin";
  return dateFmt.format(d);
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u;

export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 40) return false;
  return EMOJI_ONLY.test(t);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function compareMessages(a: { created_at: string; id: string }, b: { created_at: string; id: string }): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const ERROR_MESSAGES: Record<string, string> = {
  username_taken: "Username sedang dipakai. Kalau itu kamu di browser lain, tunggu ±10 menit lalu coba lagi, atau pilih nama lain.",
  invalid_username: "Username tidak valid.",
  invalid_session: "Sesi tidak valid. Silakan masuk lagi.",
  rate_limited: "Pelan-pelan! Tunggu beberapa detik sebelum mengirim lagi.",
  message_too_long: "Pesan terlalu panjang (maks. 2000 karakter).",
  empty_message: "Pesan kosong.",
  invalid_media: "Media tidak valid.",
  invalid_type: "Jenis pesan tidak valid.",
  not_allowed: "Kamu hanya bisa menghapus pesanmu sendiri.",
};

export function errorCode(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  const found = Object.keys(ERROR_MESSAGES).find((code) => message.includes(code));
  return found ?? null;
}

export function friendlyError(error: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  const code = errorCode(error);
  if (code) return ERROR_MESSAGES[code];
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Kamu sedang offline.";
  return fallback;
}

const fullFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short" });

export function formatFull(iso: string): string {
  return fullFmt.format(new Date(iso));
}
