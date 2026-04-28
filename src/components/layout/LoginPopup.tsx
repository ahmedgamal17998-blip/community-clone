"use client";

/**
 * M20 LoginPopup — shown once per session when a group has loginPopupEnabled.
 *
 * Theme:
 *   • Solid 100% opacity card (no see-through)
 *   • Group-primary accent strip across the top → harmonizes with the group
 *     color set by GroupThemeProvider (var(--primary))
 *   • Card uses bg-card / text-foreground so it adapts cleanly to both
 *     light and dark modes (high contrast in either)
 *   • Backdrop: blurred + dimmed so the popup pops forward
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export function LoginPopup({
  groupSlug,
  title,
  body,
  ctaUrl,
  durationSec,
}: {
  groupSlug: string;
  title: string;
  body: string;
  ctaUrl?: string | null;
  durationSec: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = `login-popup-seen:${groupSlug}`;
    if (typeof window === "undefined") return;
    const seen = sessionStorage.getItem(key);
    if (seen) return;
    setOpen(true);
    sessionStorage.setItem(key, "1");

    if (durationSec > 0) {
      const t = setTimeout(() => setOpen(false), durationSec * 1000);
      return () => clearTimeout(t);
    }
  }, [groupSlug, durationSec]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
        style={{
          // Solid 100% opacity (no alpha on the card itself).
          opacity: 1,
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Group-primary accent strip — harmonizes with the group theme,
            keeps high contrast against bg-card in both light + dark modes. */}
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />

        {/* Close button (top-right) */}
        <button
          onClick={() => setOpen(false)}
          className="absolute end-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Body */}
        <div className="px-6 pb-6 pt-5">
          <h2 className="pe-6 text-lg font-bold leading-tight text-foreground">
            {title}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/80">
            {body}
          </p>

          {ctaUrl && (
            <div className="mt-5">
              <Link
                href={ctaUrl}
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                Open
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
