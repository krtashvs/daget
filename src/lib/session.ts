import type { Session } from "./types";

const KEY = "daget.session.v1";
const SECRET_KEY = "daget.secret.v1";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — session lives in memory only */
  }
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The secret identifies this browser. It survives username changes so the
 * same person keeps ownership of their messages.
 */
export function getOrCreateSecret(): string {
  const existing = safeGet(SECRET_KEY);
  if (existing && existing.length >= 32) return existing;
  const secret = randomSecret();
  safeSet(SECRET_KEY, secret);
  return secret;
}

export function loadSession(): Session | null {
  const raw = safeGet(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.username !== "string" || typeof parsed.userId !== "string") return null;
    return { username: parsed.username, userId: parsed.userId, secret: getOrCreateSecret() };
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  safeSet(SECRET_KEY, session.secret);
  safeSet(KEY, JSON.stringify({ username: session.username, userId: session.userId }));
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadLastUsername(): string {
  const raw = safeGet(KEY);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    return typeof parsed.username === "string" ? parsed.username : "";
  } catch {
    return "";
  }
}
