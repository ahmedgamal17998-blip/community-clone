"use client";

/**
 * LoginPopup — admin-configured greeting popup. Shown:
 *   • Once per browser, then re-shown after `reshowHours` of idle.
 *   • Stored in localStorage (NOT sessionStorage) so the seen-marker
 *     survives tab close — and can be aged out via cooldown.
 *
 * Why localStorage + cooldown rather than the original sessionStorage +
 * loginAt key: the previous design only re-fired on a fresh sign-in,
 * so members who stayed signed in for days never saw the popup again.
 * The new design behaves like daily-login-reward popups elsewhere —
 * if more than `reshowHours` has passed since the last time we showed
 * it, we show it again.
 *
 * Theme:
 *   • Solid 100% opacity card, group-primary accent strip
 *   • Backdrop: blurred + dimmed
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
  reshowHours,
}: {
  groupSlug: string;
  title: string;
  body: string;
  ctaUrl?: string | null;
  durationSec: number;
  /**
   * Hours to wait before re-showing the popup to the same user.
   * 0 means re-show on every page load (stress-test only).
   * Defaults to 4 — typical "back after a break" cadence.
   */
  reshowHours: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `login-popup:${groupSlug}`;
    const lastShownStr = localStorage.getItem(key);
    const now = Date.now();

    if (lastShownStr && reshowHours > 0) {
      const lastShown = Number(lastShownStr);
      const elapsedHours = (now - lastShown) / (1000 * 60 * 60);
      if (elapsedHours < reshowHours) {
        // Within cooldown window — skip.
        // eslint-disable-next-line no-console
        console.log(
          `[login-popup] skip: groupSlug=${groupSlug} elapsedHours=${elapsedHours.toFixed(2)} reshowHours=${reshowHours}`,
        );
        return;
      }
    }

    setOpen(true);
    localStorage.setItem(key, String(now));
    // eslint-disable-next-line no-console
    console.log(
      `[login-popup] shown: groupSlug=${groupSlug} reshowHours=${reshowHours}`,
    );

    if (durationSec > 0) {
      const t = setTimeout(() => setOpen(false), durationSec * 1000);
      return () => clearTimeout(t);
    }
  }, [groupSlug, durationSec, reshowHours]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
        style={{ opacity: 1 }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />

        <button
          onClick={() => setOpen(false)}
          className="absolute end-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

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
