"use client";

/**
 * MemberPresenceDot (M15) — thin client wrapper that subscribes to Pusher
 * presence events and swaps the dot colour in real-time.
 *
 * Falls back to the server-rendered `initialStatus` when Pusher is unavailable.
 */
import { cn } from "@/lib/utils";
import { useGroupPresence } from "@/lib/use-group-presence";

type Props = {
  userId: string;
  groupId: string;
  /** Server-rendered initial status so the dot is never blank on first paint */
  initialStatus: "ONLINE" | "AWAY" | "OFFLINE";
};

export function MemberPresenceDot({ userId, groupId, initialStatus }: Props) {
  const presenceMap = useGroupPresence(groupId);

  // Prefer live Pusher data; fall back to SSR value.
  const liveStatus = presenceMap[userId];
  const status: "ONLINE" | "AWAY" | "OFFLINE" = liveStatus ?? initialStatus;

  const dotClass =
    status === "ONLINE"
      ? "bg-[hsl(var(--presence-online))]"
      : status === "AWAY"
        ? "bg-[hsl(var(--presence-away))]"
        : "bg-muted-foreground/40";

  return (
    <span
      aria-hidden
      className={cn(
        "absolute -end-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
        dotClass,
      )}
    />
  );
}
