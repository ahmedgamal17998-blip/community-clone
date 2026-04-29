"use client";

/**
 * PaywallPopup — shown when a member taps a locked premium resource
 * (channel / course). Routes them to the My Subscription page where
 * they can upgrade.
 *
 * Mounted globally inside the group shell; opened via custom event so
 * any component can trigger it without prop-drilling.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, X } from "lucide-react";

type PaywallDetail = {
  resourceLabel?: string;
  groupSlug: string;
};

const EVENT_NAME = "paywall:open";

/**
 * Helper for non-React callers (e.g. an onClick on a server-rendered link)
 * to open the paywall popup. Components should prefer importing this and
 * calling it directly.
 */
export function openPaywall(detail: PaywallDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function PaywallPopupMount() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PaywallDetail | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const ce = e as CustomEvent<PaywallDetail>;
      if (ce.detail) {
        setDetail(ce.detail);
        setOpen(true);
      }
    }
    window.addEventListener(EVENT_NAME, onOpen);
    return () => window.removeEventListener(EVENT_NAME, onOpen);
  }, []);

  if (!open || !detail) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
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
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-bold">Subscribe to unlock</h2>
          {detail.resourceLabel ? (
            <p className="mt-1 text-sm text-foreground/80">
              <span className="font-semibold">{detail.resourceLabel}</span>{" "}
              is part of a premium plan. Activate a subscription to get access.
            </p>
          ) : (
            <p className="mt-1 text-sm text-foreground/80">
              This is premium content. Activate a subscription to unlock it.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              href={`/groups/${detail.groupSlug}/me`}
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              View plans
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
