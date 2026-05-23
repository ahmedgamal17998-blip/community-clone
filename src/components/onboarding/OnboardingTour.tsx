"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  X,
  Hash,
  Megaphone,
  Lock,
  FileText,
  MessageSquare,
  Bookmark,
  Bell,
  User,
} from "lucide-react";
import { markOnboardingCompleteAction } from "@/server/actions/onboarding";
import { cn } from "@/lib/utils";

type Step = { target: string; title: string; body: string; order: number; icon?: string };

const STEP_ICON_MAP: Record<string, React.ElementType> = {
  "hash":        Hash,
  "megaphone":   Megaphone,
  "lock":        Lock,
  "file-text":   FileText,
  "message-sq":  MessageSquare,
  "bookmark":    Bookmark,
  "bell":        Bell,
  "user":        User,
};

function StepIconDisplay({ id }: { id: string }) {
  const Icon = STEP_ICON_MAP[id];
  if (!Icon) return null;
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </span>
  );
}

type Coords = {
  /** Card top in viewport pixels. */
  top: number;
  /** Card left in viewport pixels. */
  left: number;
  /** Where the card sits relative to the highlighted element. */
  placement: "top" | "bottom" | "center";
  /** Pixel x-offset of the arrow tip inside the card (for top/bottom). */
  arrowLeft?: number;
  /** Highlighted element's bounding rect (for spotlight + outline). */
  rect?: { top: number; left: number; width: number; height: number };
};

const POPUP_WIDTH = 380;
const POPUP_HEIGHT_FALLBACK = 200;
const GAP = 14;
const VIEWPORT_PADDING = 16;

/**
 * M21 onboarding tour — version 2:
 *   • Solid card with strong border + ring (clearly visible in light + dark)
 *   • Spotlight backdrop dims the rest of the screen, leaving a "hole" around
 *     the highlighted element so the eye is drawn to it
 *   • Smart positioning: card pops above or below the target, with a small
 *     arrow pointing to it. Falls back to bottom-center when no target.
 *   • Repositions on scroll / resize so the card stays glued to the target
 *     even if the viewport moves.
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
  const [coords, setCoords] = useState<Coords>({
    top: 0,
    left: 0,
    placement: "center",
  });
  const popupRef = useRef<HTMLDivElement>(null);
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const cur = sorted[idx];

  // ─── Recompute card position relative to the current target ────────────
  const computePlacement = useCallback(() => {
    if (!cur || !cur.target) {
      setCoords({ top: 0, left: 0, placement: "center" });
      return;
    }

    let el: HTMLElement | null = null;
    try {
      el = document.querySelector(cur.target) as HTMLElement | null;
    } catch {
      // Invalid selector — show centered.
      setCoords({ top: 0, left: 0, placement: "center" });
      return;
    }
    if (!el) {
      setCoords({ top: 0, left: 0, placement: "center" });
      return;
    }

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popupWidth = Math.min(POPUP_WIDTH, vw - 2 * VIEWPORT_PADDING);
    const popupHeight = popupRef.current?.offsetHeight ?? POPUP_HEIGHT_FALLBACK;

    // Pick the side with more room; prefer below the target if both fit.
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const placement: "top" | "bottom" =
      spaceBelow >= popupHeight + GAP || spaceBelow >= spaceAbove
        ? "bottom"
        : "top";

    // Horizontally: try to center the card over the target, but clamp inside
    // the viewport with some padding.
    const targetCenterX = rect.left + rect.width / 2;
    let left = targetCenterX - popupWidth / 2;
    left = Math.max(
      VIEWPORT_PADDING,
      Math.min(left, vw - popupWidth - VIEWPORT_PADDING),
    );

    let top =
      placement === "bottom"
        ? rect.bottom + GAP
        : rect.top - popupHeight - GAP;
    top = Math.max(VIEWPORT_PADDING, top);

    // Arrow tip stays under the target's center, clamped a bit inside the card.
    const arrowLeft = Math.max(20, Math.min(targetCenterX - left, popupWidth - 20));

    setCoords({
      top,
      left,
      placement,
      arrowLeft,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  }, [cur]);

  // Locate the target on each step change. The target may be lazy-mounted
  // so retry once after 300ms before giving up and centering the card.
  useEffect(() => {
    if (!cur) return;

    let cancelled = false;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryFind = (): boolean => {
      if (cancelled) return true;
      let el: HTMLElement | null = null;
      try {
        el = cur.target
          ? (document.querySelector(cur.target) as HTMLElement | null)
          : null;
      } catch {
        computePlacement();
        return true;
      }
      if (!cur.target) {
        computePlacement();
        return true;
      }
      if (!el) return false;

      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      // Compute once now, then again after the smooth scroll has settled.
      computePlacement();
      scrollTimer = setTimeout(() => computePlacement(), 350);
      return true;
    };

    if (!tryFind()) {
      retryTimer = setTimeout(() => tryFind(), 300);
    }

    const onScrollOrResize = () => computePlacement();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      cancelled = true;
      if (scrollTimer) clearTimeout(scrollTimer);
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [cur, computePlacement]);

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

  const isCenter = coords.placement === "center";
  const hasSpotlight = !isCenter && !!coords.rect;

  return (
    <>
      {/* Spotlight backdrop. When a target is found we render a transparent
          rectangle over it whose huge box-shadow fills the rest of the
          viewport with a dim color — the "hole" effect. When no target,
          we just dim the whole screen. */}
      {hasSpotlight ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-lg"
          style={{
            top: (coords.rect?.top ?? 0) - 6,
            left: (coords.rect?.left ?? 0) - 6,
            width: (coords.rect?.width ?? 0) + 12,
            height: (coords.rect?.height ?? 0) + 12,
            // 1) huge inset shadow → dims the rest of the screen
            // 2) primary outline → bright bordered ring around the target
            // 3) outer glow → soft halo that pops in dark + light mode
            boxShadow:
              "0 0 0 9999px rgba(0, 0, 0, 0.55), 0 0 0 4px hsl(var(--primary)), 0 0 0 8px hsla(var(--primary), 0.35), 0 0 28px 4px hsla(var(--primary), 0.6)",
            transition: "all 220ms ease-out",
          }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 bg-black/50"
        />
      )}

      {/* Popup card */}
      <div
        ref={popupRef}
        role="dialog"
        aria-label="Onboarding step"
        className="fixed z-50"
        style={
          isCenter
            ? {
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                width: `min(${POPUP_WIDTH}px, calc(100vw - 32px))`,
              }
            : {
                top: coords.top,
                left: coords.left,
                width: `min(${POPUP_WIDTH}px, calc(100vw - 32px))`,
              }
        }
      >
        <div className="relative rounded-2xl border-2 border-primary bg-card p-5 text-foreground shadow-2xl ring-4 ring-primary/20">
          {/* Arrow pointer (only when anchored to a target) */}
          {!isCenter && coords.arrowLeft != null ? (
            <div
              aria-hidden
              className={cn(
                "absolute h-3 w-3 rotate-45 border-2 border-primary bg-card",
                coords.placement === "bottom"
                  ? "-top-[8px] border-b-0 border-r-0"
                  : "-bottom-[8px] border-l-0 border-t-0",
              )}
              style={{ left: coords.arrowLeft - 6 }}
            />
          ) : null}

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {cur.icon && <StepIconDisplay id={cur.icon} />}
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Step {idx + 1} of {sorted.length}
                </div>
                <h3 className="mt-1 text-base font-semibold text-foreground">
                  {cur.title}
                </h3>
              </div>
            </div>
            <button
              onClick={finish}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">
            {cur.body}
          </p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {idx < sorted.length - 1 ? (
              <button
                onClick={() => setIdx((i) => i + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={finish}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
