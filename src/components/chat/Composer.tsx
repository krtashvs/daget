"use client";

import { ImagePlay, LoaderCircle, Plus, SendHorizontal, Smile, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { validateImageFile } from "@/lib/api";
import { sendGif, sendImage, sendText } from "@/lib/chat-actions";
import { ALLOWED_IMAGE_ACCEPT, CHANNEL_NAME, MAX_MESSAGE_LENGTH, TYPING_THROTTLE_MS } from "@/lib/constants";
import { broadcastTyping } from "@/lib/realtime";
import type { GifResult } from "@/lib/types";
import { cn, usernameColor } from "@/lib/utils";
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

const MENTION_QUERY = /(^|\s)@([A-Za-z0-9_.-]{0,24})$/;

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
  const messages = useChat((s) => s.messages);
  const me = useChat((s) => s.session?.username ?? "");
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

  const mentionCandidates = useMemo(() => {
    if (!mention) return [];
    const names = new Map<string, string>();
    for (const u of online) names.set(u.username.toLowerCase(), u.username);
    for (let i = messages.length - 1; i >= 0 && names.size < 60; i--) {
      const n = messages[i].username;
      if (!names.has(n.toLowerCase())) names.set(n.toLowerCase(), n);
    }
    names.delete(me.toLowerCase());
    const q = mention.query.toLowerCase();
    return Array.from(names.values())
      .filter((n) => n.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [mention, online, messages, me]);

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
        applyMention(mentionCandidates[mentionIndex] ?? mentionCandidates[0]);
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
          {mentionCandidates.map((name, i) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={i === mentionIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyMention(name)}
              onMouseEnter={() => setMentionIndex(i)}
              className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm", i === mentionIndex ? "bg-white/[0.08]" : "")}
            >
              <Avatar username={name} size={24} />
              <span className="truncate font-medium text-zinc-100">{name}</span>
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
              {replyingTo.content && <span className="text-zinc-500"> — {replyingTo.content}</span>}
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
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
              canSend ? "bg-zinc-50 text-zinc-950 hover:bg-white active:scale-95" : "text-zinc-600",
            )}
            aria-label="Kirim"
          >
            <SendHorizontal className="h-[18px] w-[18px]" />
          </button>
        </div>

        {text.length > MAX_MESSAGE_LENGTH - 200 && (
          <p className={cn("px-4 pb-2 text-right text-[11px]", text.length > MAX_MESSAGE_LENGTH ? "text-red-300" : "text-zinc-500")}>
            {text.length}/{MAX_MESSAGE_LENGTH}
          </p>
        )}
      </div>
    </div>
  );
}
