"use client";

import { Fragment, memo, useMemo, type ReactNode } from "react";
import type { Member, RoleDef } from "@/lib/types";
import { cn, isEmojiOnly } from "@/lib/utils";
import { useChat } from "@/store/chat";

const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(@[A-Za-z0-9_.-]{2,40})/g;

interface MessageContentProps {
  content: string;
  me: string;
  myId: string;
  /** Message was sent by staff with @everyone/@here. */
  everyone?: boolean;
}

export const MessageContent = memo(function MessageContent({ content, me, myId, everyone }: MessageContentProps) {
  const members = useChat((s) => s.members);
  const roleDefs = useChat((s) => s.roleDefs);
  const bySlug = useMemo(() => {
    const map = new Map<string, RoleDef>();
    for (const r of Object.values(roleDefs)) if (r.slug) map.set(r.slug, r);
    return map;
  }, [roleDefs]);
  const byHandle = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of Object.values(members)) if (m.handle) map.set(m.handle.toLowerCase(), m);
    return map;
  }, [members]);

  if (!content) return null;
  const jumbo = isEmojiOnly(content);
  const meLower = me.toLowerCase();

  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of content.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(content.slice(last, index));
    const [token, url, mention] = match;
    if (url) {
      parts.push(
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="break-all text-sky-300/90 underline decoration-sky-300/30 underline-offset-2 hover:decoration-sky-300"
        >
          {url}
        </a>,
      );
    } else if (mention) {
      const handle = mention.slice(1).toLowerCase();
      const member = byHandle.get(handle);
      const role = bySlug.get(handle);
      if (role) {
        parts.push(
          <span
            key={index}
            className="rounded-md px-1 py-px font-medium"
            style={{ color: role.color2 ?? role.color, backgroundColor: `${role.color}33` }}
          >
            @{role.name}
          </span>,
        );
      } else if (handle === "everyone" || handle === "here") {
        parts.push(
          <span
            key={index}
            className={cn("rounded-md px-1 py-px font-medium", everyone ? "bg-amber-300/20 text-amber-200" : "text-zinc-300")}
          >
            {token}
          </span>,
        );
      } else if (member) {
        parts.push(
          <button
            key={index}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              useChat.getState().openProfile(member.id);
            }}
            className={cn(
              "rounded-md px-1 py-px font-medium transition",
              member.id === myId ? "bg-white/20 text-white" : "bg-white/[0.08] text-zinc-100 hover:bg-white/[0.14]",
            )}
          >
            @{member.username}
          </button>,
        );
      } else {
        const isMe = handle === meLower || meLower.startsWith(`${handle} `);
        parts.push(
          <span key={index} className={cn("rounded-md px-1 py-px font-medium", isMe ? "bg-white/20 text-white" : "bg-white/[0.08] text-zinc-100")}>
            {token}
          </span>,
        );
      }
    }
    last = index + token.length;
  }
  if (last < content.length) parts.push(content.slice(last));

  return (
    <div className={cn("whitespace-pre-wrap break-words text-zinc-200", jumbo ? "py-0.5 text-4xl leading-tight" : "text-[15px] leading-[1.45]")}>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </div>
  );
});

/** True when the message mentions the given username (supports names with spaces). */
export function mentionsUser(content: string, username: string): boolean {
  if (!content || !username) return false;
  const lower = content.toLowerCase();
  const name = username.toLowerCase();
  let from = 0;
  while (true) {
    const at = lower.indexOf(`@${name}`, from);
    if (at === -1) return false;
    const next = lower[at + name.length + 1];
    if (next === undefined || !/[a-z0-9_.-]/.test(next)) return true;
    from = at + 1;
  }
}
