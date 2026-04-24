"use client";

/**
 * useGroupPresence (M15) — subscribes to presence-group-{groupId} Pusher
 * channel and maintains a local map of userId → "ONLINE" | "OFFLINE".
 *
 * Returns an empty map when Pusher is unavailable (graceful no-op).
 */
import { useEffect, useRef, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";

type PresenceMap = Record<string, "ONLINE" | "AWAY" | "OFFLINE">;

export function useGroupPresence(groupId: string | null): PresenceMap {
  const [presenceMap, setPresenceMap] = useState<PresenceMap>({});
  const channelNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = `presence-group-${groupId}`;
    channelNameRef.current = channelName;

    const ch = pusher.subscribe(channelName);

    ch.bind(
      "presence-updated",
      (data: { userId: string; status: "ONLINE" | "AWAY" | "OFFLINE" }) => {
        if (!data?.userId) return;
        setPresenceMap((prev) => ({ ...prev, [data.userId]: data.status }));
      },
    );

    return () => {
      try {
        pusher.unsubscribe(channelName);
      } catch {
        /* ignore */
      }
      channelNameRef.current = null;
    };
  }, [groupId]);

  return presenceMap;
}
