"use client";

import { ImagePlus, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { validateImageFile } from "@/lib/api";
import type { Session } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRealtimeRoom } from "@/hooks/useRealtimeRoom";
import { useChat } from "@/store/chat";
import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { MembersPanel } from "./MembersPanel";
import { MessageList } from "./MessageList";
import { DeleteConfirmDialog, Lightbox, MessageActionSheet } from "./Overlays";
import { SearchPanel } from "./SearchPanel";

interface ChatRoomProps {
  session: Session;
  gifSearchEnabled: boolean;
  onRename: () => void;
}

export function ChatRoom({ session, gifSearchEnabled, onRename }: ChatRoomProps) {
  useRealtimeRoom(session);

  const panel = useChat((s) => s.panel);
  const setPanel = useChat((s) => s.setPanel);
  const status = useChat((s) => s.status);
  const [headerHeight, setHeaderHeight] = useState(56);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // Show the online list by default on wide screens.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches && useChat.getState().panel === null) setPanel("members");
  }, [setPanel]);

  const onHeaderHeight = useCallback((h: number) => setHeaderHeight(h), []);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) useChat.getState().pushToast(invalid);
    else useChat.getState().setDraftFile(file);
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      <section
        className="relative flex min-w-0 flex-1 flex-col"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => hasFiles(e) && e.preventDefault()}
        onDrop={onDrop}
        aria-label="Chat"
      >
        <ChatHeader onRename={onRename} onHeight={onHeaderHeight} />

        {status !== "connected" && (
          <div
            className="absolute inset-x-0 z-20 flex justify-center px-4"
            style={{ top: headerHeight + 8 }}
            role="status"
          >
            <div className="glass-strong flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-zinc-300 shadow-lg shadow-black/40">
              <WifiOff className="h-3.5 w-3.5" />
              {status === "reconnecting" ? "Koneksi terputus, menyambung ulang…" : "Menghubungkan…"}
            </div>
          </div>
        )}

        <MessageList topInset={headerHeight} />
        <Composer gifSearchEnabled={gifSearchEnabled} />

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-40 flex animate-fade-in flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-white/25 bg-black/70 text-zinc-200 backdrop-blur-md">
            <ImagePlus className="h-10 w-10" />
            <p className="text-sm font-medium">Lepaskan untuk mengirim gambar</p>
          </div>
        )}
      </section>

      {panel && (
        <>
          <div className="fixed inset-0 z-40 animate-fade-in bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setPanel(null)} />
          <aside
            className={cn(
              "glass-strong fixed inset-y-0 right-0 z-50 w-[86%] max-w-sm animate-slide-in-right border-y-0 border-r-0 pt-safe pb-safe",
              "lg:static lg:z-auto lg:max-w-none lg:animate-none lg:bg-ink-900/60",
              panel === "search" ? "lg:w-96" : "lg:w-72",
            )}
            aria-label={panel === "search" ? "Pencarian pesan" : "Pengguna online"}
          >
            {panel === "search" ? <SearchPanel /> : <MembersPanel />}
          </aside>
        </>
      )}

      <MessageActionSheet />
      <DeleteConfirmDialog />
      <Lightbox />
    </div>
  );
}
