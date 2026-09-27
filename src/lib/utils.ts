import type { CSSProperties } from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
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
  // Only letters/digits, emoji-safe (no half surrogate pairs).
  const words = username
    .trim()
    .split(/\s+/)
    .map((w) => Array.from(w).filter((c) => /[\p{L}\p{N}]/u.test(c)))
    .filter((chars) => chars.length > 0);
  if (words.length === 0) return "?";
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).join("").toUpperCase();
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
  maintenance: "Daget lagi istirahat sebentar. Coba lagi nanti ya.",
  discord_required: "Masuk dengan Discord dulu untuk mengirim pesan.",
  not_verified: "Akun Discord kamu belum terverifikasi. Masuk lagi ya.",
  not_signed_in: "Sesi kamu berakhir. Masuk lagi dengan Discord.",
  banned: "Akun kamu diblokir dari Daget oleh admin.",
  cannot_change_self: "Kamu tidak bisa mengubah role/status dirimu sendiri.",
  invalid_role: "Role tidak valid.",
  not_found: "Anggota tidak ditemukan.",
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

/** Short label for non-text messages (previews, search, reply bars). */
export function mediaLabel(type: string): string {
  if (type === "voice") return "Pesan suara";
  if (type === "gif") return "GIF";
  return "Gambar";
}

export interface RoleColor {
  color: string;
  color2?: string | null;
}

/** Name style: highest Discord role colour (solid or gradient), else a stable pastel. */
export function nameStyle(username: string, role?: RoleColor | null): CSSProperties {
  if (role?.color2) {
    return {
      backgroundImage: `linear-gradient(90deg, ${role.color}, ${role.color2})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: role.color,
    };
  }
  return { color: role?.color || usernameColor(username) };
}

/** Background for a role dot/swatch (solid or gradient). */
export function swatchStyle(role: RoleColor): CSSProperties {
  return role.color2 ? { backgroundImage: `linear-gradient(135deg, ${role.color}, ${role.color2})` } : { backgroundColor: role.color };
}

/** Highest cosmetic role of a member that is known locally. */
export function topRole<T extends { id: string }>(roleIds: string[] | undefined, defs: Record<string, T>): T | undefined {
  for (const id of roleIds ?? []) if (defs[id]) return defs[id];
  return undefined;
}

export function memberStyle<T extends { id: string } & RoleColor>(
  username: string,
  roleIds: string[] | undefined,
  defs: Record<string, T>,
): CSSProperties {
  return nameStyle(username, topRole(roleIds, defs));
}

/** Account creation time encoded in a Discord snowflake id. */
export function snowflakeDate(id: string | null | undefined): string | null {
  if (!id || !/^\d{15,21}$/.test(id)) return null;
  try {
    const ms = Number((BigInt(id) >> BigInt(22)) + BigInt(1420070400000));
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

const longDateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

export function formatLongDate(iso: string | null | undefined): string {
  return iso ? longDateFmt.format(new Date(iso)) : "—";
}
