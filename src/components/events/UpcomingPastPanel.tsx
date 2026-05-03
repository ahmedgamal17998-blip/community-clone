"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/calendar";
import type { ExpandedOccurrence } from "@/server/events";
import { openPaywall } from "@/components/access/PaywallPopup";

type Props = {
  upcoming: ExpandedOccurrence[];
  past: ExpandedOccurrence[];
  groupSlug: string;
  /** Event IDs the viewer can see but not access — rendered dimmed with a
   *  lock icon and a click that opens the paywall popup. */
  lockedEventIds?: Set<string>;
};

export function UpcomingPastPanel({
  upcoming,
  past,
  groupSlug,
  lockedEventIds,
}: Props) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const list = tab === "upcoming" ? upcoming : past;
  const locked = lockedEventIds ?? new Set<string>();
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex border-b border-border">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors",
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-2">
        {list.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No {tab} events.
          </p>
        ) : (
          <ul className="space-y-1">
            {list.map((o, i) => {
              const isLocked = locked.has(o.eventId);
              const meta = (
                <>
                  <span
                    className={cn(
                      "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                      isLocked && "opacity-50",
                    )}
                    style={{ backgroundColor: o.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-sm font-medium",
                        isLocked &&
                          "text-muted-foreground/70 line-through decoration-muted-foreground/30",
                      )}
                    >
                      {o.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {o.occurrenceStartsAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {formatTime(o.occurrenceStartsAt)}
                    </div>
                  </div>
                  {isLocked && (
                    <Lock className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/60" />
                  )}
                </>
              );
              return (
                <li key={i}>
                  {isLocked ? (
                    <button
                      type="button"
                      onClick={() =>
                        openPaywall({ groupSlug, resourceLabel: o.title })
                      }
                      className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted/60"
                    >
                      {meta}
                    </button>
                  ) : (
                    <Link
                      href={`/groups/${groupSlug}/events/${o.eventId}?occ=${encodeURIComponent(
                        o.occurrenceStartsAt.toISOString(),
                      )}`}
                      className="flex items-start gap-2 rounded-md p-2 hover:bg-muted"
                    >
                      {meta}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
