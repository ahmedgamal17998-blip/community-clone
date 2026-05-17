"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, X, Zap, Star } from "lucide-react";
import { dailyCheckInAction, type CheckInResult } from "@/server/checkin";
import { cn } from "@/lib/utils";

// ─── Tune display behaviour here ─────────────────────────────────────────────
const AUTO_DISMISS_MS = 5_000;   // how long the popup stays before fading out
// ─────────────────────────────────────────────────────────────────────────────

export function CheckInMount({ groupId }: { groupId: string }) {
  const [result, setResult] = useState<CheckInResult | null>(null);
  // Guard against React StrictMode double-invocation (dev only).
  // The server action itself is idempotent, but we want to avoid showing
  // { awarded: false } overwriting an earlier { awarded: true } result.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    dailyCheckInAction({ groupId }).then(setResult);
  }, [groupId]);

  if (!result?.awarded) return null;
  return <CheckInPopup result={result} />;
}

function CheckInPopup({
  result,
}: {
  result: Extract<CheckInResult, { awarded: true }>;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Slight delay so the page finishes loading before the popup slides in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible]);

  function dismiss() {
    setLeaving(true);
    setTimeout(() => setVisible(false), 300);
  }

  if (!visible) return null;

  const { streak, pointsEarned, isMilestone, milestoneBonus } = result;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-72 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300",
        leaving ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      {/* Coloured top bar — orange for milestone, primary otherwise */}
      <div
        className={cn(
          "h-1.5 w-full",
          isMilestone
            ? "bg-gradient-to-r from-orange-500 to-yellow-400"
            : "bg-gradient-to-r from-primary to-primary/60",
        )}
      />

      <div className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg",
                isMilestone
                  ? "bg-orange-500/15 text-orange-500"
                  : "bg-primary/10 text-primary",
              )}
            >
              {isMilestone ? "🏆" : <Flame className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">
                {isMilestone ? "Milestone unlocked!" : "Welcome back!"}
              </p>
              <p className="text-xs text-muted-foreground">Daily check-in</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Streak row */}
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="flex-1 text-sm font-medium">
            {streak}-day streak
          </span>
          {isMilestone && (
            <Star className="h-4 w-4 text-yellow-500" />
          )}
        </div>

        {/* Points earned */}
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm text-muted-foreground">Points earned</span>
          <span className="ms-auto rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
            +{pointsEarned}
          </span>
        </div>

        {/* Milestone breakdown */}
        {isMilestone && milestoneBonus > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Includes <strong>+{milestoneBonus}</strong> streak bonus 🎉
          </p>
        )}
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="h-0.5 w-full bg-muted">
        <div
          className="h-full bg-primary/40 transition-none"
          style={{ animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards` }}
        />
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%;   }
        }
      `}</style>
    </div>
  );
}
