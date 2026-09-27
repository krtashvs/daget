"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

let activeChannel: RealtimeChannel | null = null;
let identity: { userId: string; username: string } | null = null;

export function setActiveChannel(channel: RealtimeChannel | null, who: { userId: string; username: string } | null) {
  activeChannel = channel;
  identity = who;
}

export function broadcastTyping(typing: boolean) {
  if (!activeChannel || !identity) return;
  void activeChannel.send({
    type: "broadcast",
    event: "typing",
    payload: { userId: identity.userId, username: identity.username, typing },
  });
}
