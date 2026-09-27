"use client";

import { CornerUpLeft, ImageIcon, Mic } from "lucide-react";
import { jumpToMessage } from "@/lib/chat-actions";
import type { ReplyPreview } from "@/lib/types";
import { mediaLabel, usernameColor } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";

export function ReplyReference({ replyId }: { replyId: string }) {
  const local = useChat((s) => s.messages.find((m) => m.id === replyId));
  const cached = useChat((s) => s.replyCache[replyId]);
  const preview: ReplyPreview | null | undefined = local ?? cached;

  return (
    <div className="relative mb-1 flex h-5 min-w-0 items-center pl-[52px] text-[13px]">
      <span aria-hidden="true" className="absolute left-[19px] top-[10px] h-[14px] w-[26px] rounded-tl-lg border-l-2 border-t-2 border-white/15" />
      {preview === undefined ? (
        <span className="text-zinc-500">Memuat…</span>
      ) : preview === null ? (
        <span className="flex items-center gap-1 italic text-zinc-500">
          <CornerUpLeft className="h-3.5 w-3.5" />
          Pesan asli telah dihapus
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void jumpToMessage(preview)}
          className="flex min-w-0 items-center gap-1.5 text-left text-zinc-400 transition hover:text-zinc-200"
        >
          <Avatar username={preview.username} src={preview.avatar_url} size={16} />
          <span className="shrink-0 font-semibold opacity-90" style={{ color: usernameColor(preview.username) }}>
            @{preview.username}
          </span>
          <span className="truncate">
            {preview.content || (
              <span className="inline-flex items-center gap-1 italic">
                {preview.type === "voice" ? <Mic className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />} {mediaLabel(preview.type)}
              </span>
            )}
          </span>
          {preview.content && preview.type !== "text" && <ImageIcon className="h-3.5 w-3.5 shrink-0" />}
        </button>
      )}
    </div>
  );
}
