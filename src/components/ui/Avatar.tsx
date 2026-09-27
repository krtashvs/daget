"use client";

import { useState } from "react";
import { avatarGradient, cn, initials } from "@/lib/utils";

interface AvatarProps {
  username: string;
  /** Discord avatar URL; falls back to initials if missing or broken. */
  src?: string | null;
  size?: number;
  className?: string;
  online?: boolean;
}

export function Avatar({ username, src, size = 40, className, online }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;

  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(src ?? null)}
          className="h-full w-full select-none rounded-full bg-white/[0.06] object-cover ring-1 ring-inset ring-white/10"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full w-full select-none items-center justify-center rounded-full font-semibold text-white/90 ring-1 ring-inset ring-white/10"
          style={{ background: avatarGradient(username), fontSize: Math.round(size * 0.36) }}
        >
          {initials(username)}
        </span>
      )}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-ink-900 bg-emerald-400" />
      )}
    </span>
  );
}
