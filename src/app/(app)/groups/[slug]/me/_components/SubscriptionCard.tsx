"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";

type Plan = {
  id: string;
  name: string;
  durationDays: number;
  priceCents: number;
  currency: string;
};

export function SubscriptionCard({
  groupId,
  userId,
  remainingDays,
  activeSub,
  plans,
}: {
  groupId: string;
  userId: string;
  remainingDays: number | null;
  activeSub: { planName: string; currentPeriodEnd: Date } | null;
  plans: Plan[];
}) {
  const [pending, startTransition] = useTransition();
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  // Member-initiated subscription purchase. The actual payment goes to the
  // custom payment system; here we just open a placeholder flow that the
  // payment integration will replace.
  const subscribe = () => {
    if (!selectedPlan) return;
    startTransition(async () => {
      // Placeholder: redirect to payment URL or show message until custom
      // payment system is wired.
      setMsg(
        "Payment integration is being set up. Please contact an admin to activate your subscription manually for now.",
      );
    });
  };

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <CalendarClock className="h-4 w-4" />
            Subscription
          </div>
          <div className="mt-2 text-3xl font-semibold">
            {remainingDays != null ? `${remainingDays} days remaining` : "Inactive"}
          </div>
          {activeSub && (
            <p className="mt-1 text-sm text-muted-foreground">
              {activeSub.planName} • Renews{" "}
              {new Date(activeSub.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {plans.length > 0 && (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {plans.map((p) => (
            <label
              key={p.id}
              className={`cursor-pointer rounded-xl border p-4 transition ${
                selectedPlan === p.id
                  ? "border-primary ring-2 ring-primary/20"
                  : "hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="plan"
                value={p.id}
                checked={selectedPlan === p.id}
                onChange={() => setSelectedPlan(p.id)}
                className="hidden"
              />
              <div className="font-semibold">{p.name}</div>
              <div className="mt-1 text-2xl font-bold">
                ${(p.priceCents / 100).toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {p.durationDays}d
                </span>
              </div>
            </label>
          ))}
        </div>
      )}

      <button
        onClick={subscribe}
        disabled={pending || !selectedPlan || plans.length === 0}
        className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {remainingDays ? "Extend subscription" : "Subscribe now"}
      </button>

      {msg && (
        <p className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded p-2">
          {msg}
        </p>
      )}
    </div>
  );
}
