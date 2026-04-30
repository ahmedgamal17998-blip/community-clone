"use client";

/**
 * Admin diagnostic card — shows the live access state for a member so
 * admins can answer "why does this user see / not see premium content?"
 * without digging through the database.
 *
 * Includes a "Grant trial" button that fires `grantTrialToMemberAction`
 * to manually create a GROUP-level GRANT for testing or support cases.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Clock, Sparkles, Loader2 } from "lucide-react";
import { grantTrialToMemberAction } from "@/server/actions/access";

type Props = {
  groupId: string;
  userId: string;
  trial: { expiresAt: Date | null; granted: boolean };
  hasActiveSub: boolean;
  hasGroupSubAccess: boolean;
  freeTrialDays: number | null;
};

export function AccessDiagnostics({
  groupId,
  userId,
  trial,
  hasActiveSub,
  hasGroupSubAccess,
  freeTrialDays,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const grant = (days: number) => {
    setResult(null);
    startTransition(async () => {
      const res = await grantTrialToMemberAction({
        groupId,
        userId,
        days,
      });
      if (res.ok) {
        setResult(`✓ Granted ${days}-day trial. Refresh to see updated state.`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setResult(`✗ Failed: ${res.error ?? "unknown error"}`);
      }
    });
  };

  const trialActive =
    trial.granted && trial.expiresAt && trial.expiresAt > new Date();
  const trialMs = trial.expiresAt
    ? trial.expiresAt.getTime() - Date.now()
    : 0;
  const trialHours = Math.floor(trialMs / (1000 * 60 * 60));
  const trialDays = Math.floor(trialHours / 24);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <DiagnosticCell
          label="Free trial"
          ok={trialActive ?? false}
          warning={!trialActive && trial.granted}
          icon={trialActive ? Sparkles : Clock}
          value={
            trialActive
              ? trialDays > 0
                ? `${trialDays}d ${trialHours % 24}h remaining`
                : `${trialHours}h remaining`
              : trial.granted
                ? "Expired"
                : "Not granted"
          }
        />
        <DiagnosticCell
          label="Active subscription"
          ok={hasActiveSub}
          icon={CheckCircle2}
          value={hasActiveSub ? "Yes" : "No"}
        />
        <DiagnosticCell
          label="Group-level access"
          ok={hasGroupSubAccess}
          icon={CheckCircle2}
          value={
            hasGroupSubAccess
              ? "Unlocked (premium content visible)"
              : "Locked (premium content gated)"
          }
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Manual trial grant
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Useful for testing the trial flow, supporting a member who didn't
          get one on join, or extending an existing trial. Creates a
          GROUP-level MemberAccess GRANT — premium channels / courses /
          events all unlock for the chosen number of days.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => grant(d)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {d === 1 ? "1 day" : `${d} days`}
            </button>
          ))}
          {freeTrialDays && freeTrialDays > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              · group default: {freeTrialDays} day{freeTrialDays === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-[11px] text-amber-700 dark:text-amber-400">
              · no group-level trial configured
            </span>
          )}
        </div>
        {result && (
          <p
            className={`mt-2 text-xs font-semibold ${
              result.startsWith("✓")
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {result}
          </p>
        )}
      </div>
    </div>
  );
}

function DiagnosticCell({
  label,
  value,
  ok,
  warning,
  icon: Icon,
}: {
  label: string;
  value: string;
  ok: boolean;
  warning?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tone = ok
    ? "text-green-600 dark:text-green-400"
    : warning
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";
  const StatusIcon = ok
    ? CheckCircle2
    : warning
      ? AlertCircle
      : AlertCircle;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
        <span className="text-sm">{value}</span>
        <StatusIcon className={`ms-auto h-4 w-4 shrink-0 ${tone}`} />
      </div>
    </div>
  );
}
