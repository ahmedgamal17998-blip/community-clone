"use client";

/**
 * Client-side Pusher singleton + React hooks (M15).
 *
 * getPusherClient() returns null when NEXT_PUBLIC_PUSHER_APP_KEY is not set
 * at build-time — all hooks become graceful no-ops and components fall back to
 * their existing polling logic.
 */
import { useEffect, useRef } from "react";
import type PusherType from "pusher-js";
import type { Channel } from "pusher-js";

let _instance: PusherType | null | undefined = undefined;

export function getPusherClient(): PusherType | null {
  if (_instance !== undefined) return _instance;

  const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER;

  if (!key) {
    _instance = null;
    return null;
  }

  try {
    // Dynamic import avoids SSR issues (this file is client-only but
    // Next.js may still analyse it during server build).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PusherLib = require("pusher-js") as typeof PusherType;
    _instance = new PusherLib(key, {
      cluster: cluster ?? "mt1",
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    });
  } catch {
    _instance = null;
  }
  return _instance;
}

/**
 * Subscribe to a Pusher channel and clean up on unmount.
 * Returns null when Pusher is unavailable (graceful no-op).
 */
export function useChannel(channelName: string | null): Channel | null {
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!channelName) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const ch = pusher.subscribe(channelName);
    channelRef.current = ch;

    return () => {
      try {
        pusher.unsubscribe(channelName);
      } catch {
        /* ignore */
      }
      channelRef.current = null;
    };
  }, [channelName]);

  return channelRef.current;
}

/**
 * Bind a handler to a named event on a channel.
 * No-op when channel is null (Pusher unavailable or no channel name given).
 */
export function useEvent<T>(
  channel: Channel | null,
  event: string,
  handler: (data: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler; // always latest without re-binding

  useEffect(() => {
    if (!channel) return;
    const cb = (data: T) => handlerRef.current(data);
    channel.bind(event, cb);
    return () => {
      try {
        channel.unbind(event, cb);
      } catch {
        /* ignore */
      }
    };
  }, [channel, event]);
}
