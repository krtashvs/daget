"use client";

import { AtSign, ImagePlay, LoaderCircle, Mic, Plus, SendHorizontal, Smile, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { validateImageFile } from "@/lib/api";
import { sendGif, sendImage, sendText, sendVoice } from "@/lib/chat-actions";
import { ALLOWED_IMAGE_ACCEPT, CHANNEL_NAME, MAX_MESSAGE_LENGTH, TYPING_THROTTLE_MS } from "@/lib/constants";
import { broadcastTyping } from "@/lib/realtime";
import type { GifResult, Role } from "@/lib/types";
import { cn, mediaLabel, nameColor, usernameColor } from "@/lib/utils";
import { MAX_VOICE_MS, useVoiceRecorder, type RecorderError } from "@/hooks/useVoiceRecorder";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { GifPanel } from "./GifPanel";
import { TypingIndicator } from "./TypingIndicator";

const EmojiPanel = dynamic(() => import("./EmojiPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center text-zinc-500">
      <LoaderCircle className="h-5 w-5 animate-spin" />
    </div>
  ),
});

type Picker = "emoji" | "gif" | null;

const MENTION_QUERY = /(^|\s)@([A-Za-z0-9_.-]{0,32})$/;

interface MentionCandidate {
  key: string;
  /** Text inserted after "@". */
  insert: string;
  label: string;
  sub: string | null;
  avatarUrl: string | null;
  username: string;
  role?: Role;
  special?: boolean;
}

function isCoarsePointer() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Composer({ gifSearchEnabled }: { gifSearchEnabled: boolean }) {
  const replyingTo = useChat((s) => s.replyingTo);
  const setReplyingTo = useChat((s) => s.setReplyingTo);
  const draftFile = useChat((s) => s.draftFile);
  const setDraftFile = useChat((s) => s.setDraftFile);
  const online = useChat((s) => s.online);
  const members = useChat((s) => s.members);
  const myId = useChat((s) => s.session?.userId ?? "");
  const myRole = useChat((s) => s.session?.role ?? "member");
  const pushToast = useChat((s) => s.pushToast);

  const [text, setText] = useState("");
  const [picker, setPicker] = useState<Picker>(null);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const gifFileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);

  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!draftFile) {
      setDraftPreview(null);
      return;
    }
    const url = URL.createObjectURL(draftFile);
    setDraftPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draftFile]);

  // Auto-grow textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  // Focus composer when starting a reply (desktop only — avoids popping the mobile keyboard unexpectedly).
  useEffect(() => {
    if (replyingTo && !isCoarsePointer()) textareaRef.current?.focus();
  }, [replyingTo]);

  // Close pickers on outside click / Escape.
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPicker(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setPicker(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picker]);

  useEffect(() => () => {
    if (lastTypingSent.current) broadcastTyping(false);
  }, []);

  const stopTyping = useCallback(() => {
    if (lastTypingSent.current) {
      lastTypingSent.current = 0;
      broadcastTyping(false);
    }
  }, []);

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const onlineIds = new Set(online.map((u) => u.userId));
    const out: MentionCandidate[] = [];
    if (myRole === "admin" || myRole === "mod") {
      for (const special of ["everyone", "here"]) {
        if (special.startsWith(q)) {
          out.push({
            key: special,
            insert: special,
            label: `@${special}`,
            sub: special === "everyone" ? "Notifikasi semua anggota" : "Notifikasi yang sedang online",
            avatarUrl: null,
            username: special,
            special: true,
          });
        }
      }
    }
    const people = Object.values(members)
      .filter((m) => m.handle && !m.banned && m.id !== myId)
      .filter((m) => !q || m.handle!.toLowerCase().startsWith(q) || m.username.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
      .sort((a, b) => Number(onlineIds.has(b.id)) - Number(onlineIds.has(a.id)) || a.username.localeCompare(b.username));
    for (const m of people) {
      out.push({ key: m.id, insert: m.handle!, label: m.username, sub: `@${m.handle}`, avatarUrl: m.avatarUrl, username: m.username, role: m.role });
    }
    return out.slice(0, 7);
  }, [mention, online, members, myId, myRole]);

  const updateMention = (value: string, caret: number) => {
    const match = MENTION_QUERY.exec(value.slice(0, caret));
    if (match) {
      setMention({ query: match[2], start: caret - match[2].length - 1 });
      setMentionIndex(0);
    } else if (mention) {
      setMention(null);
    }
  };

  const applyMention = (name: string) => {
    // name = Discord @username (or "everyone"/"here")
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const insert = `@${name} `;
    const next = text.slice(0, mention.start) + insert + text.slice(caret);
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = mention.start + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    updateMention(value, e.target.selectionStart ?? value.length);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      broadcastTyping(true);
    }
  };

  const attachFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const invalid = validateImageFile(file);
      if (invalid) {
        pushToast(invalid);
        return;
      }
      setDraftFile(file);
      setPicker(null);
      if (!isCoarsePointer()) textareaRef.current?.focus();
    },
    [pushToast, setDraftFile],
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    attachFile(e.target.files?.[0]);
    e.target.value = "";
  };

  const canSend = Boolean(text.trim() || draftFile) && text.length <= MAX_MESSAGE_LENGTH;

  const onVoiceRecorded = useCallback((blob: Blob, durationMs: number) => sendVoice(blob, durationMs), []);
  const onVoiceError = useCallback(
    (e: RecorderError) =>
      pushToast(
        e === "denied"
          ? "Izin mikrofon ditolak. Izinkan mikrofon untuk situs ini di pengaturan browser."
          : e === "unsupported"
            ? "Browser ini belum mendukung rekam suara."
            : "Gagal membuka mikrofon.",
      ),
    [pushToast],
  );
  const voice = useVoiceRecorder(onVoiceRecorded, onVoiceError);

  const submit = () => {
    if (!canSend) return;
    if (draftFile) {
      sendImage(draftFile, text);
      setDraftFile(null);
    } else {
      sendText(text);
    }
    setText("");
    setMention(null);
    setPicker(null);
    stopTyping();
    if (!isCoarsePointer()) textareaRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setMentionIndex((i) => (i + delta + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention((mentionCandidates[mentionIndex] ?? mentionCandidates[0]).insert);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Escape") {
      if (replyingTo) setReplyingTo(null);
      else if (draftFile) setDraftFile(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isCoarsePointer()) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      attachFile(file);
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + emoji.length;
      if (!isCoarsePointer()) el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const pickGif = (gif: GifResult) => {
    sendGif(gif);
    setPicker(null);
  };

  const onGifButton = () => {
    if (gifSearchEnabled) setPicker((p) => (p === "gif" ? null : "gif"));
    else gifFileRef.current?.click();
  };

  return (
    <div ref={rootRef} className="relative z-20 px-3 pb-[max(var(--safe-bottom),10px)] sm:px-4">
      <TypingIndicator />

      {picker && (
        <div className="absolute bottom-full left-3 right-3 mb-1 animate-slide-up overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-850 shadow-2xl shadow-black/50 sm:left-auto sm:right-4 sm:w-[380px]">
          {gifSearchEnabled && (
          <div className="flex gap-1 border-b border-white/[0.05] p-1.5">
            {(["emoji", "gif"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPicker(tab)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  picker === tab ? "bg-white/10 text-zinc-50" : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                {tab === "emoji" ? "Emoji" : "GIF"}
              </button>
            ))}
          </div>
          )}
          {picker === "emoji" ? <EmojiPanel onPick={insertEmoji} /> : <GifPanel onPick={pickGif} />}
        </div>
      )}

      {mention && mentionCandidates.length > 0 && !picker && (
        <div className="absolute bottom-full left-3 right-3 mb-1 animate-slide-up overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-850 p-1 shadow-2xl shadow-black/50 sm:left-4 sm:right-auto sm:w-72" role="listbox">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Anggota</p>
          {mentionCandidates.map((c, i) => (
            <button
              key={c.key}
              type="button"
              role="option"
              aria-selected={i === mentionIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyMention(c.insert)}
              onMouseEnter={() => setMentionIndex(i)}
              className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm", i === mentionIndex ? "bg-white/[0.08]" : "")}
            >
              {c.special ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-300/20 text-amber-200">
                  <AtSign className="h-3.5 w-3.5" />
                </span>
              ) : (
                <Avatar username={c.username} src={c.avatarUrl} size={24} />
              )}
              <span className={cn("truncate font-medium", c.special ? "text-amber-200" : "text-zinc-100")} style={c.special ? undefined : { color: nameColor(c.username, c.role) }}>
                {c.label}
              </span>
              {c.sub && <span className="ml-auto truncate pl-2 text-xs text-zinc-500">{c.sub}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="glass overflow-hidden rounded-2xl shadow-lg shadow-black/30">
        {replyingTo && (
          <div className="flex items-center gap-2 border-b border-white/[0.05] bg-white/[0.02] py-1.5 pl-4 pr-1.5 text-[13px] text-zinc-400">
            <span className="min-w-0 flex-1 truncate">
              Membalas{" "}
              <span className="font-semibold" style={{ color: usernameColor(replyingTo.username) }}>
                {replyingTo.username}
              </span>
              <span className="text-zinc-500"> — {replyingTo.content || mediaLabel(replyingTo.type)}</span>
            </span>
            <button type="button" onClick={() => setReplyingTo(null)} className="icon-btn h-7 w-7" aria-label="Batal membalas">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {draftFile && draftPreview && (
          <div className="flex items-center gap-3 border-b border-white/[0.05] p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draftPreview} alt="Lampiran" className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/10" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium text-zinc-200">{draftFile.name || "Gambar"}</p>
              <p className="text-xs text-zinc-500">{formatBytes(draftFile.size)} · tambahkan keterangan (opsional)</p>
            </div>
            <button type="button" onClick={() => setDraftFile(null)} className="icon-btn" aria-label="Hapus lampiran">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {voice.recording ? (
          <div className="flex items-center gap-2 p-1.5" role="status" aria-label="Merekam pesan suara">
            <button type="button" onClick={() => voice.stop(false)} className="icon-btn h-10 w-10 rounded-full hover:text-red-300" aria-label="Batalkan rekaman">
              <Trash2 className="h-5 w-5" />
            </button>
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="text-sm tabular-nums text-zinc-100">
              {Math.floor(voice.elapsed / 60000)}:{String(Math.floor((voice.elapsed % 60000) / 1000)).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">
              Merekam… maks {Math.round(MAX_VOICE_MS / 60000)} menit
            </span>
            <button
              type="button"
              onClick={() => voice.stop(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-50 text-zinc-950 transition hover:bg-white active:scale-95"
              aria-label="Kirim pesan suara"
            >
              <SendHorizontal className="h-[18px] w-[18px]" />
            </button>
          </div>
        ) : (
        <div className="flex items-end gap-0.5 p-1.5">
          <button type="button" onClick={() => fileRef.current?.click()} className="icon-btn h-10 w-10 rounded-full" aria-label="Kirim gambar" title="Kirim gambar">
            <Plus className="h-5 w-5" />
          </button>
          <input ref={fileRef} type="file" accept={ALLOWED_IMAGE_ACCEPT} className="hidden" onChange={onFileChange} tabIndex={-1} />
          <input ref={gifFileRef} type="file" accept=".gif,image/gif" className="hidden" onChange={onFileChange} tabIndex={-1} />

          <label htmlFor="composer" className="sr-only">
            Pesan
          </label>
          <textarea
            id="composer"
            ref={textareaRef}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => window.setTimeout(() => setMention(null), 120)}
            onSelect={(e) => updateMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH + 100}
            placeholder={draftFile ? "Tambahkan keterangan…" : `Kirim pesan ke #${CHANNEL_NAME}`}
            enterKeyHint="send"
            className="scrollbar-thin max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent px-1.5 py-[9px] text-base leading-[22px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={onGifButton}
            className={cn("icon-btn h-10 w-10 rounded-full", picker === "gif" && "bg-white/10 text-zinc-100")}
            aria-label="GIF"
            title="GIF"
          >
            <ImagePlay className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setPicker((p) => (p === "emoji" ? null : "emoji"))}
            className={cn("icon-btn h-10 w-10 rounded-full", picker === "emoji" && "bg-white/10 text-zinc-100")}
            aria-label="Emoji"
            title="Emoji"
          >
            <Smile className="h-5 w-5" />
          </button>
          {canSend ? (
            <button
              type="button"
              onClick={submit}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-50 text-zinc-950 transition hover:bg-white active:scale-95"
              aria-label="Kirim"
            >
              <SendHorizontal className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPicker(null);
                void voice.start();
              }}
              className="icon-btn h-10 w-10 rounded-full"
              aria-label="Rekam pesan suara"
              title="Rekam pesan suara"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
        </div>
        )}

        {text.length > MAX_MESSAGE_LENGTH - 200 && (
          <p className={cn("px-4 pb-2 text-right text-[11px]", text.length > MAX_MESSAGE_LENGTH ? "text-red-300" : "text-zinc-500")}>
            {text.length}/{MAX_MESSAGE_LENGTH}
          </p>
        )}
      </div>
    </div>
  );
}
