"use client";

import { useState, useTransition } from "react";
import {
  activateSubscriptionAction,
  cancelSubscriptionAction,
} from "@/server/actions/subscription";

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

  const activate = () => {
    if (!planId) return;
    startTransition(async () => {
      await activateSubscriptionAction({ groupId, userId, planId });
    });
  };

  const cancel = () => {
    startTransition(async () => {
      await cancelSubscriptionAction({ groupId, userId });
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Activate / Extend with plan
          </label>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={plans.length === 0}
          >
            {plans.length === 0 ? (
              <option>No plans configured</option>
            ) : (
              plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.durationDays}d / ${(p.priceCents / 100).toFixed(2)}
                </option>
              ))
            )}
          </select>
        </div>
        <button
          onClick={activate}
          disabled={pending || !planId}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : "Activate / Extend"}
        </button>
        <button
          onClick={cancel}
          disabled={pending}
          className="rounded-lg border border-destructive/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          Cancel active
        </button>
      </div>

      {activeSubscriptions.length > 0 && (
        <div className="rounded-lg bg-muted/40 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent subscriptions
          </h3>
          <ul className="space-y-1 text-sm">
            {activeSubscriptions.map((s) => (
              <li key={s.id} className="flex justify-between">
                <span>
                  {s.plan.name} — {s.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  ends {new Date(s.currentPeriodEnd).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
