"use client";

import { useState, useTransition } from "react";
import { Pause, Play, X } from "lucide-react";
import {
  activateSubscriptionAction,
  setSubscriptionStatusAction,
} from "@/server/actions/subscription";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  durationDays: number;
  priceCents: number;
};

type Sub = {
  id: string;
  status: string;
  startedAt: Date;
  currentPeriodEnd: Date;
  plan: { name: string };
};

const CURRENCY_PREFIX = "$"; // info row only — Plans page formats price in its own currency.

export function SubscriptionActions({
  groupId,
  userId,
  plans,
  activeSubscriptions,
}: {
  groupId: string;
  userId: string;
  plans: Plan[];
  activeSubscriptions: Sub[];
}) {
  const [pending, startTransition] = useTransition();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  // Local copy so the per-row Pause/Cancel/Resume buttons can flip status
  // optimistically without forcing a full page reload.
  const [subs, setSubs] = useState<Sub[]>(activeSubscriptions);

  const activate = () => {
    if (!planId) return;
    startTransition(async () => {
      await activateSubscriptionAction({ groupId, userId, planId });
    });
  };

  const setStatus = (id: string, status: "ACTIVE" | "PAUSED" | "CANCELED") => {
    const prev = subs;
    setSubs((p) => p.map((s) => (s.id === id ? { ...s, status } : s)));
    startTransition(async () => {
      const res = await setSubscriptionStatusAction({
        subscriptionId: id,
        status,
      });
      if (!res?.ok) setSubs(prev); // rollback
    });
  };

  return (
    <div className="space-y-4">
      {/* Activate / extend row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            Activate / Extend with plan
          </label>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={plans.length === 0}
          >
            {plans.length === 0 ? (
              <option>No plans configured</option>
            ) : (
              plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.durationDays}d / {CURRENCY_PREFIX}
                  {(p.priceCents / 100).toFixed(2)}
                </option>
              ))
            )}
          </select>
        </div>
        <button
          onClick={activate}
          disabled={pending || !planId}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "…" : "Activate / Extend"}
        </button>
      </div>

      {subs.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subscriptions
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {subs.length} total
            </span>
          </div>
          <ul className="divide-y divide-border">
            {subs.map((s) => {
              const status = s.status.toUpperCase();
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.plan.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Period ends{" "}
                      {new Date(s.currentPeriodEnd).toLocaleDateString()}
                    </div>
                  </div>

                  <StatusBadge status={status} />

                  {/* Per-row controls — different actions per status */}
                  <div className="flex shrink-0 items-center gap-1">
                    {status === "ACTIVE" && (
                      <>
                        <ActionBtn
                          onClick={() => setStatus(s.id, "PAUSED")}
                          disabled={pending}
                          tone="muted"
                          icon={<Pause className="h-3.5 w-3.5" />}
                        >
                          Pause
                        </ActionBtn>
                        <ActionBtn
                          onClick={() => setStatus(s.id, "CANCELED")}
                          disabled={pending}
                          tone="destructive"
                          icon={<X className="h-3.5 w-3.5" />}
                        >
                          Cancel
                        </ActionBtn>
                      </>
                    )}

                    {status === "PAUSED" && (
                      <>
                        <ActionBtn
                          onClick={() => setStatus(s.id, "ACTIVE")}
                          disabled={pending}
                          tone="primary"
                          icon={<Play className="h-3.5 w-3.5" />}
                        >
                          Resume
                        </ActionBtn>
                        <ActionBtn
                          onClick={() => setStatus(s.id, "CANCELED")}
                          disabled={pending}
                          tone="destructive"
                          icon={<X className="h-3.5 w-3.5" />}
                        >
                          Cancel
                        </ActionBtn>
                      </>
                    )}

                    {status === "CANCELED" && (
                      <ActionBtn
                        onClick={() => setStatus(s.id, "ACTIVE")}
                        disabled={pending}
                        tone="primary"
                        icon={<Play className="h-3.5 w-3.5" />}
                      >
                        Reactivate
                      </ActionBtn>
                    )}

                    {status === "EXPIRED" && (
                      <span className="text-[11px] text-muted-foreground">
                        Use Activate / Extend above
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: {
      label: "Active",
      cls: "bg-green-500/10 text-green-700 dark:text-green-400",
    },
    PAUSED: {
      label: "Paused",
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    CANCELED: {
      label: "Canceled",
      cls: "bg-destructive/10 text-destructive",
    },
    EXPIRED: { label: "Expired", cls: "bg-muted text-muted-foreground" },
  };
  const m =
    map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}

function ActionBtn({
  onClick,
  disabled,
  tone,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone: "primary" | "muted" | "destructive";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    primary: "bg-primary/10 text-primary hover:bg-primary/15",
    muted: "bg-muted text-foreground hover:bg-accent",
    destructive:
      "bg-destructive/10 text-destructive hover:bg-destructive/15",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
        tones[tone],
      )}
    >
      {icon}
      {children}
    </button>
  );
}
