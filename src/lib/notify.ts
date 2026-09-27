"use client";

import type { MessageRow } from "./types";
import { mediaLabel } from "./utils";

const PREF_KEY = "daget.notify";
const BASE_TITLE = "Daget";

let mentionCount = 0;
let unread = false;
let audio: AudioContext | null = null;

export function notificationsEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Turn browser notifications on/off. Returns the resulting state. */
export async function setNotifications(on: boolean): Promise<boolean> {
  if (on && notificationsSupported() && Notification.permission !== "granted") {
    const result = await Notification.requestPermission();
    if (result !== "granted") on = false;
  }
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  return on;
}

function isAway() {
  return document.visibilityState !== "visible" || !document.hasFocus();
}

function renderTitle() {
  document.title = mentionCount > 0 ? `(${mentionCount}) ${BASE_TITLE}` : unread ? `• ${BASE_TITLE}` : BASE_TITLE;
}

function ping() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const now = audio.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  } catch {
    /* audio unavailable */
  }
}

export function isMentioned(row: MessageRow, myId: string, myRoleIds: string[]): boolean {
  if (row.user_id === myId) return false;
  return Boolean(
    row.mention_everyone || row.mentions?.includes(myId) || row.mention_roles?.some((id) => myRoleIds.includes(id)),
  );
}

/** Called for every new message from realtime. */
export function handleIncoming(row: MessageRow, myId: string, myRoleIds: string[], onOpen: (row: MessageRow) => void) {
  if (row.user_id === myId) return;
  const mentioned = isMentioned(row, myId, myRoleIds);
  if (!isAway()) {
    if (mentioned) ping();
    return;
  }
  unread = true;
  if (mentioned) {
    mentionCount += 1;
    ping();
    if (notificationsEnabled() && notificationsSupported() && Notification.permission === "granted") {
      try {
        const n = new Notification(`${row.username} menyebut kamu`, {
          body: row.content || mediaLabel(row.type),
          icon: row.avatar_url || "/icon.svg",
          tag: row.id,
        });
        n.onclick = () => {
          window.focus();
          onOpen(row);
          n.close();
        };
      } catch {
        /* some mobile browsers only allow notifications from a service worker */
      }
    }
  }
  renderTitle();
}

/** Resets the tab title when the user comes back; unlocks audio on first interaction. */
export function initNotifier(): () => void {
  const reset = () => {
    if (isAway()) return;
    mentionCount = 0;
    unread = false;
    renderTitle();
  };
  const unlock = () => {
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") void audio.resume();
    } catch {
      /* ignore */
    }
  };
  document.addEventListener("visibilitychange", reset);
  window.addEventListener("focus", reset);
  window.addEventListener("pointerdown", unlock, { once: true });
  return () => {
    document.removeEventListener("visibilitychange", reset);
    window.removeEventListener("focus", reset);
    window.removeEventListener("pointerdown", unlock);
    mentionCount = 0;
    unread = false;
    renderTitle();
  };
}
