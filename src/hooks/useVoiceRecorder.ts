"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_VOICE_MS = 2 * 60 * 1000;

// MP4/AAC plays everywhere (incl. iOS); fall back to WebM/Opus where MP4 recording isn't available.
const CANDIDATES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export type RecorderError = "unsupported" | "denied" | "failed";

/** Tap-to-record voice notes via MediaRecorder. */
export function useVoiceRecorder(onRecorded: (blob: Blob, durationMs: number) => void, onError: (e: RecorderError) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const sendOnStop = useRef(false);
  const timer = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  const stop = useCallback((send: boolean) => {
    const r = recorder.current;
    if (!r) return;
    sendOnStop.current = send;
    if (r.state !== "inactive") r.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorder.current) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("unsupported");
      return;
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      onError((e as DOMException)?.name === "NotAllowedError" ? "denied" : "failed");
      return;
    }
    const mimeType = pickMimeType();
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
    } catch {
      media.getTracks().forEach((t) => t.stop());
      onError("failed");
      return;
    }
    stream.current = media;
    recorder.current = r;
    chunks.current = [];
    sendOnStop.current = false;
    r.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.current.push(ev.data);
    };
    r.onstop = () => {
      const duration = Date.now() - startedAt.current;
      const type = (r.mimeType || mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunks.current, { type });
      const send = sendOnStop.current;
      cleanup();
      if (send && duration >= 700 && blob.size > 0) onRecorded(blob, Math.min(duration, MAX_VOICE_MS));
    };
    startedAt.current = Date.now();
    r.start(250);
    setRecording(true);
    if ("vibrate" in navigator) navigator.vibrate?.(15);
    timer.current = window.setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_VOICE_MS) stop(true);
    }, 200);
  }, [cleanup, onError, onRecorded, stop]);

  // Never leave the microphone on after unmount.
  useEffect(
    () => () => {
      sendOnStop.current = false;
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) window.clearInterval(timer.current);
    },
    [],
  );

  return { recording, elapsed, start, stop };
}
