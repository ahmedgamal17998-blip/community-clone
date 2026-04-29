"use client";

/**
 * EventsLockedView — placeholder shown when a non-admin member doesn't
 * have an active subscription / trial. The whole tab is dimmed; any click
 * opens the paywall popup. Renders fake event icons so the user can see
 * what's behind the gate.
 */

import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { openPaywall } from "@/components/access/PaywallPopup";

const PLACEHOLDER_EVENTS = [
  { icon: Calendar, label: "Weekly meetup" },
  { icon: Clock, label: "Live Q&A" },
  { icon: Users, label: "Workshop" },
  { icon: MapPin, label: "Member mixer" },
  { icon: Calendar, label: "Office hours" },
  { icon: Clock, label: "Course launch" },
];

export function EventsLockedView({ groupSlug }: { groupSlug: string }) {
  function handleClick() {
    openPaywall({ groupSlug, resourceLabel: "Events" });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className="cursor-pointer space-y-4 opacity-50 transition-opacity hover:opacity-70"
      title="Subscribe to unlock events"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold line-through decoration-muted-foreground/30">
            Events
          </h1>
          <p className="text-xs text-muted-foreground">
            Locked — subscribe to view and RSVP.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEHOLDER_EVENTS.map((ev, i) => {
          const Icon = ev.icon;
          return (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-muted-foreground line-through decoration-muted-foreground/30">
                  {ev.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Locked content
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
