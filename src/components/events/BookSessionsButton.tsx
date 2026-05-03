"use client";

import Link from "next/link";
import { CalendarClock, Info, Lock } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { openPaywall } from "@/components/access/PaywallPopup";

/**
 * "Book sessions" button shown next to the Day/Week/Month switcher in
 * the Events header. Behaviour:
 *
 *   • disabled=true  → renders a dimmed locked button; clicking opens the
 *     paywall popup (used when every offering is premium-only and the
 *     viewer has no plan that unlocks any of them).
 *   • otherwise navigates to `/groups/[slug]/book`.
 *
 * The info icon next to the label exposes the admin-set tooltip on hover
 * (or tap on touch). Tooltip is plain text so we render it as a native
 * `title` attribute as a no-JS fallback plus a styled bubble for the
 * pointer-on-screen variant.
 */
export function BookSessionsButton({
  groupSlug,
  label,
  tooltip,
  locked,
}: {
  groupSlug: string;
  label: string;
  tooltip: string | null;
  locked: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const href = `/groups/${groupSlug}/book`;

  const baseClass =
    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors";

  const buttonInner = (
    <>
      {locked ? (
        <Lock className="h-3.5 w-3.5 opacity-70" />
      ) : (
        <CalendarClock className="h-3.5 w-3.5" />
      )}
      <span className={cn(locked && "line-through decoration-muted-foreground/40")}>
        {label}
      </span>
    </>
  );

  return (
    <div className="relative inline-flex items-center">
      {locked ? (
        <button
          type="button"
          onClick={() =>
            openPaywall({ groupSlug, resourceLabel: label })
          }
          className={cn(
            baseClass,
            "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
          )}
          title={tooltip ?? undefined}
        >
          {buttonInner}
        </button>
      ) : (
        <Link
          href={href}
          className={cn(
            baseClass,
            "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          title={tooltip ?? undefined}
        >
          {buttonInner}
        </Link>
      )}
      {tooltip ? (
        <button
          type="button"
          aria-label="What's this?"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
          onClick={(e) => {
            e.preventDefault();
            setShowTooltip((s) => !s);
          }}
          className="ms-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {tooltip && showTooltip ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-lg">
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}
