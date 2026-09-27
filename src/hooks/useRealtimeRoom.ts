"use client";

import { useEffect } from "react";
import { touchMember } from "@/lib/api";
import { ensureReplies, jumpToMessage, refreshMembers, syncMessages } from "@/lib/chat-actions";
import { handleIncoming, initNotifier } from "@/lib/notify";
import { HEARTBEAT_MS, ROOM_CHANNEL } from "@/lib/constants";
import { setActiveChannel } from "@/lib/realtime";
import { getSupabase } from "@/lib/supabase";
import type { MessageRow, OnlineUser, Profile, ReactionRow } from "@/lib/types";
import { errorCode } from "@/lib/utils";
import { useChat } from "@/store/chat";

interface PresenceMeta {
  user_id: string;
  username: string;
  avatar_url: string | null;
  online_at: string;
}

interface TypingPayload {
  userId: string;
  username: string;
  typing: boolean;
}

/**
 * One Supabase Realtime channel carries everything:
 *  • postgres_changes on public.messages (new / updated / deleted messages)
 *  • presence (who is online)
 *  • broadcast "typing" events
 */
export function useRealtimeRoom(session: Profile) {
  const { userId, username, avatarUrl, authId } = session;

  useEffect(() => {
    const supabase = getSupabase();
    const store = useChat.getState;
    let everConnected = false;

    store().resetRoom();
    void syncMessages();
    void refreshMembers();

    const channel = supabase.channel(ROOM_CHANNEL, {
      config: {
        presence: { key: userId },
        broadcast: { self: false, ack: false },
      },
    });

    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as MessageRow;
        store().applyServerMessage(row);
        if (row.user_id !== userId) store().setTyping(row.username, false);
        void ensureReplies([row]);
        handleIncoming(row, userId, store().members[userId]?.roleIds ?? [], (r) => void jumpToMessage(r));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        store().applyServerUpdate(payload.new as MessageRow);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const id = (payload.old as Partial<MessageRow>).id;
        if (id) store().removeMessage(id);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) => {
        store().addReaction(payload.new as ReactionRow);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) => {
        const old = payload.old as Partial<ReactionRow>;
        if (old.message_id && old.user_id && old.emoji) store().removeReaction(old as ReactionRow);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceMeta>();
        const users: OnlineUser[] = [];
        for (const [key, metas] of Object.entries(state)) {
          const meta = metas[metas.length - 1];
          if (!meta) continue;
          users.push({ userId: meta.user_id ?? key, username: meta.username, avatarUrl: meta.avatar_url ?? null, onlineAt: meta.online_at });
        }
        users.sort((a, b) => a.username.localeCompare(b.username, "id", { sensitivity: "base" }));
        store().setOnline(users);
        // Someone new showed up — pull their role/handle into the directory.
        if (users.some((u) => !store().members[u.userId])) void refreshMembers();
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as TypingPayload;
        if (!p || p.userId === userId || typeof p.username !== "string") return;
        store().setTyping(p.username, Boolean(p.typing));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          const reconnected = everConnected;
          everConnected = true;
          store().setStatus("connected");
          void channel.track({ user_id: userId, username, avatar_url: avatarUrl, online_at: new Date().toISOString() } satisfies PresenceMeta);
          if (reconnected) void syncMessages();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          store().setStatus(everConnected ? "reconnecting" : "connecting");
        }
      });

    setActiveChannel(channel, { userId, username });

    const typingTimer = window.setInterval(() => store().pruneTyping(), 1000);
    const stopNotifier = initNotifier();

    const membersTimer = window.setInterval(() => void refreshMembers(), 3 * 60 * 1000);

    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      touchMember(authId)
        .then((profile) => {
          const current = store().session;
          if (current && (profile.username !== current.username || profile.role !== current.role)) {
            store().setSession(profile);
          }
        })
        .catch((error) => {
          const code = errorCode(error);
          if (code === "banned") store().setKickReason("Akun kamu diblokir dari Daget oleh admin.");
          else if (code === "not_verified" || code === "not_signed_in") store().setKickReason("Sesi kamu berakhir. Silakan masuk lagi dengan Discord.");
        });
    };
    const heartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_MS);
    heartbeat();

    // Mobile browsers freeze sockets in the background — catch up when we come back.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncMessages();
        heartbeat();
      }
    };
    const onOnline = () => void syncMessages();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearInterval(typingTimer);
      stopNotifier();
      window.clearInterval(heartbeatTimer);
      window.clearInterval(membersTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      setActiveChannel(null, null);
      void supabase.removeChannel(channel);
    };
  }, [userId, username, avatarUrl, authId]);
}
