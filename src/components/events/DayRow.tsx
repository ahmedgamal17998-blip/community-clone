"use client";

import { Lock } from "lucide-react";
import { formatTime } from "@/lib/calendar";
import type { ExpandedOccurrence } from "@/server/events";
import { openPaywall } from "@/components/access/PaywallPopup";
import { cn } from "@/lib/utils";

export function DayRow({
  occ,
  groupSlug,
  locked,
}: {
  occ: ExpandedOccurrence;
  groupSlug: string;
  locked: boolean;
}) {
  const meta = (
    <div className="min-w-0">
      <div
        className={cn(
          "truncate text-sm font-medium",
          locked && "text-muted-foreground/70 line-through decoration-muted-foreground/30",
        )}
      >
        {occ.title}
      </div>
      <div className="text-xs text-muted-foreground">
        {formatTime(occ.occurrenceStartsAt)} – {formatTime(occ.occurrenceEndsAt)}
      </div>
    </div>
  );

  if (locked) {
    return (
      <li
        className="rounded-md border border-border p-3 opacity-70"
        style={{ borderLeft: `4px solid ${occ.color}99` }}
      >
        <div className="flex items-center justify-between gap-3">
          {meta}
          <button
            type="button"
            onClick={() =>
              openPaywall({ groupSlug, resourceLabel: occ.title })
            }
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
          >
            <Lock className="h-3 w-3" />
            Unlock
          </button>
        </div>
      </li>
    );
  }

  const href = `/groups/${groupSlug}/events/${occ.eventId}?occ=${encodeURIComponent(
    occ.occurrenceStartsAt.toISOString(),
  )}`;
  return (
    <li
      className="rounded-md border border-border p-3"
      style={{ borderLeft: `4px solid ${occ.color}` }}
    >
      <div className="flex items-center justify-between gap-3">
        {meta}
        <a
          href={href}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Open →
        </a>
      </div>
    </li>
  );
}
