"use client";

import { useEffect, useState } from "react";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { markOnboardingCompleteAction } from "@/server/actions/onboarding";

type Step = { target: string; title: string; body: string; order: number };

/**
 * M21: Lightweight onboarding tour. No external dep — just a centered card
 * with prev/next/skip + a faint backdrop. Can highlight a target via CSS
 * outline if the target selector resolves; otherwise just shows centered.
 */
export function OnboardingTour({
  groupId,
  steps,
}: {
  groupId: string;
  steps: Step[];
}) {
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const cur = sorted[idx];

  useEffect(() => {
    if (!cur || !cur.target) return;

    let el: HTMLElement | null = null;
    let cleanup: (() => void) | null = null;

    const tryHighlight = (): boolean => {
      try {
        el = document.querySelector(cur.target) as HTMLElement | null;
      } catch {
        // Invalid selector typed by an admin in "custom" mode — bail silently
        // so the centered card still renders.
        return true;
      }
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const prevOutline = el.style.outline;
      const prevOffset = el.style.outlineOffset;
      const prevRadius = el.style.borderRadius;
      el.style.outline = "3px solid hsl(var(--primary))";
      el.style.outlineOffset = "2px";
      el.style.borderRadius = "8px";
      cleanup = () => {
        if (!el) return;
        el.style.outline = prevOutline;
        el.style.outlineOffset = prevOffset;
        el.style.borderRadius = prevRadius;
      };
      return true;
    };

    // Element may not exist yet (e.g. lazy-mounted sidebar). Retry briefly.
    if (!tryHighlight()) {
      const t = setTimeout(() => tryHighlight(), 300);
      return () => {
        clearTimeout(t);
        cleanup?.();
      };
    }

    return () => cleanup?.();
  }, [cur]);

  if (!open || !cur) return null;

  const finish = async () => {
    setOpen(false);
    try {
      await markOnboardingCompleteAction({ groupId });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("onboarding complete error:", e);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Welcome • Step {idx + 1} of {sorted.length}
            </div>
            <h3 className="mt-1 text-base font-semibold">{cur.title}</h3>
          </div>
          <button
            onClick={finish}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Skip tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
          {cur.body}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {idx < sorted.length - 1 ? (
            <button
              onClick={() => setIdx((i) => i + 1)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
