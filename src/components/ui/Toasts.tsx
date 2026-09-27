"use client";

import { X } from "lucide-react";
import { useChat } from "@/store/chat";

export function Toasts() {
  const toasts = useChat((s) => s.toasts);
  const dismiss = useChat((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+64px)] z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="glass-strong pointer-events-auto flex max-w-sm animate-slide-up items-center gap-3 rounded-2xl py-2.5 pl-4 pr-2 text-sm text-zinc-200 shadow-xl shadow-black/40">
          <span className="flex-1">{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="icon-btn h-7 w-7" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
