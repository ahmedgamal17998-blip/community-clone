"use client";

import { useEffect } from "react";

/**
 * Pings /api/presence/heartbeat every 60s while the tab is visible.
 * Pauses when hidden, sends one final ping on beforeunload.
 * Renders nothing.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      // fire-and-forget
      fetch("/api/presence/heartbeat", {
        method: "POST",
        keepalive: true,
      }).catch(() => {
        /* ignore network errors */
      });
    };

    const start = () => {
      if (timer) return;
      ping();
      timer = setInterval(() => {
        if (document.visibilityState === "visible") ping();
      }, 60_000);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    const onUnload = () => {
      try {
        // keepalive ensures this still fires during unload
        fetch("/api/presence/heartbeat", { method: "POST", keepalive: true });
      } catch {
        /* ignore */
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return null;
}
