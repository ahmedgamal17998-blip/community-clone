"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { formatTime } from "@/lib/calendar";
import type { ExpandedOccurrence } from "@/server/events";
import { openPaywall } from "@/components/access/PaywallPopup";
import { cn } from "@/lib/utils";

export function EventDot({
  occ,
  groupSlug,
  locked = false,
}: {
  occ: ExpandedOccurrence;
  groupSlug: string;
  /** When true, the row renders dimmed and a click opens the paywall popup
   *  instead of navigating. Set by the page when the viewer fails the
   *  premium-tier access check on this event. */
  locked?: boolean;
}) {
  if (locked) {
    return (
      <button
        type="button"
        onClick={() =>
          openPaywall({ groupSlug, resourceLabel: occ.title })
        }
        className={cn(
          "flex w-full items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-left text-[11px]",
          "text-muted-foreground/60 hover:bg-muted/60",
        )}
        style={{ borderLeft: `3px solid ${occ.color}99` }}
        title={`${occ.title} — locked`}
      >
        <Lock className="h-3 w-3 shrink-0 opacity-70" />
        <span className="shrink-0 tabular-nums text-muted-foreground/60">
          {formatTime(occ.occurrenceStartsAt)}
        </span>
        <span className="truncate line-through decoration-muted-foreground/30">
          {occ.title}
        </span>
      </button>
    );
  }

  const href = `/groups/${groupSlug}/events/${occ.eventId}?occ=${encodeURIComponent(
    occ.occurrenceStartsAt.toISOString(),
  )}`;
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-[11px] hover:bg-muted"
      style={{ borderLeft: `3px solid ${occ.color}` }}
      title={occ.title}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: occ.color }}
      />
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatTime(occ.occurrenceStartsAt)}
      </span>
      <span className="truncate">{occ.title}</span>
    </Link>
  );
}
