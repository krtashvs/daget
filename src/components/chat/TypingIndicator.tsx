"use client";

import { useChat } from "@/store/chat";

function describe(names: string[]): string {
  if (names.length === 1) return `${names[0]} sedang mengetik...`;
  if (names.length === 2) return `${names[0]} dan ${names[1]} sedang mengetik...`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, dan ${names[2]} sedang mengetik...`;
  return "Beberapa orang sedang mengetik...";
}

export function TypingIndicator() {
  const typing = useChat((s) => s.typing);
  const me = useChat((s) => s.session?.username);
  const names = Object.keys(typing).filter((n) => n !== me);

  return (
    <div className="flex h-6 items-center gap-2 px-5 text-xs text-zinc-400" aria-live="polite">
      {names.length > 0 && (
        <>
          <span className="flex items-center gap-[3px]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-zinc-300" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </span>
          <span className="truncate">
            {names.length <= 3 ? (
              <>
                {names.map((n, i) => (
                  <span key={n}>
                    <span className="font-semibold text-zinc-200">{n}</span>
                    {i < names.length - 2 ? ", " : i === names.length - 2 ? (names.length > 2 ? ", dan " : " dan ") : ""}
                  </span>
                ))}{" "}
                sedang mengetik...
              </>
            ) : (
              describe(names)
            )}
          </span>
        </>
      )}
    </div>
  );
}
