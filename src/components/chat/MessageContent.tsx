import { Fragment, memo, type ReactNode } from "react";
import { cn, isEmojiOnly } from "@/lib/utils";

const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(@[A-Za-z0-9_.-]{2,24})/g;

interface MessageContentProps {
  content: string;
  me: string;
}

export const MessageContent = memo(function MessageContent({ content, me }: MessageContentProps) {
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
      const isMe = handle === meLower || meLower.startsWith(`${handle} `);
      parts.push(
        <span
          key={index}
          className={cn("rounded-md px-1 py-px font-medium", isMe ? "bg-white/20 text-white" : "bg-white/[0.08] text-zinc-100")}
        >
          {token}
        </span>,
      );
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
