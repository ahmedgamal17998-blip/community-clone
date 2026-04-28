"use client";

/**
 * AnnouncementPopup
 *
 * Behavior (decided 2026-04-28):
 *   • While the announcement is within its active window (startsAt → endsAt),
 *     it pops up on every page mount — group entry, tab change, etc.
 *   • If the member dismisses it (X or auto-close after durationSec),
 *     it snoozes for 1 hour via sessionStorage, then resumes popping.
 *   • Clicking the CTA link also counts as "seen" and snoozes for 1 hour.
 *
 * Snooze key: `announcement-snoozed:<id>` = epoch-ms expiry timestamp.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const SNOOZE_HOURS = 1;
const SNOOZE_MS = SNOOZE_HOURS * 60 * 60 * 1000;

function snoozeKey(id: string) {
  return `announcement-snoozed:${id}`;
}

export function AnnouncementPopup({
  announcement,
}: {
  announcement: {
    id: string;
    title: string;
    body: string;
    ctaUrl: string | null;
    durationSec: number;
  };
}) {
  const [open, setOpen] = useState(false);

  // Decide on mount whether we should show. Respects the snooze window.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(snoozeKey(announcement.id));
    if (raw) {
      const expiresAt = Number(raw);
      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        // still snoozed — stay closed
        return;
      }
      // snooze expired — clear the marker and show
      sessionStorage.removeItem(snoozeKey(announcement.id));
    }
    setOpen(true);

    if (announcement.durationSec > 0) {
      const t = setTimeout(() => closeAndSnooze(), announcement.durationSec * 1000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement.id, announcement.durationSec]);

  const closeAndSnooze = () => {
    setOpen(false);
    if (typeof window === "undefined") return;
    const expiresAt = Date.now() + SNOOZE_MS;
    sessionStorage.setItem(snoozeKey(announcement.id), String(expiresAt));
  };

  if (!open) return null;

  return (
    <div
      className="fixed bottom-6 end-6 z-50 w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
      role="dialog"
      aria-modal="false"
      style={{ opacity: 1 }}
    >
      {/* Group-primary accent strip (matches LoginPopup, harmonizes with theme) */}
      <div
        className="h-1.5 w-full"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
        }}
      />

      <button
        onClick={closeAndSnooze}
        className="absolute end-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="px-5 pb-5 pt-4">
        <h3 className="pe-6 text-[15px] font-bold leading-tight text-foreground">
          {announcement.title}
        </h3>
        <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/80">
          {announcement.body}
        </p>
        {announcement.ctaUrl && (
          <div className="mt-3">
            <Link
              href={announcement.ctaUrl}
              onClick={closeAndSnooze}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              Open
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
