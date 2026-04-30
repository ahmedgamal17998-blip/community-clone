"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2 } from "lucide-react";

type Plan = {
  id: string;
  name: string;
  durationDays: number;
  priceCents: number;
  currency: string;
  externalProductSlug: string | null;
  externalPlanType: string | null;
};

type ActiveSub = {
  id: string;
  planName: string;
  currentPeriodEnd: Date;
  cancelRequestedAt: Date | null;
  hasExternal: boolean;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
  egp: "E£",
  sar: "﷼",
  aed: "د.إ",
  kwd: "د.ك",
};

function formatPrice(priceCents: number, currency: string) {
  const amount = (priceCents / 100).toFixed(2);
  const sym = CURRENCY_SYMBOLS[currency.toLowerCase()] ?? currency.toUpperCase();
  return `${sym}${amount}`;
}

export function SubscriptionCard({
  remainingDays,
  activeSubs,
  plans,
}: {
  remainingDays: number | null;
  activeSubs: ActiveSub[];
  plans: Plan[];
}) {
  const [pending, startTransition] = useTransition();
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Subscribe → redirect to the checkout endpoint, which 302s to the
  // external payment system's branded page with prefilled user info.
  const subscribe = () => {
    if (!selectedPlan) return;
    const plan = plans.find((p) => p.id === selectedPlan);
    if (!plan?.externalProductSlug || !plan?.externalPlanType) {
      setMsg(
        "This plan isn't connected to the payment system yet. Ask an admin to set the External Product Slug + Plan Type in admin → Plans.",
      );
      return;
    }
    setMsg(null);
    window.location.href = `/api/payments/checkout?planId=${encodeURIComponent(
      selectedPlan,
    )}`;
  };

  const cancel = (subscriptionId: string) => {
    if (!confirm("Cancel this subscription? Access will continue until the current period ends.")) return;
    setCancellingId(subscriptionId);
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/payments/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) {
          setMsg(`Cancel failed: ${data.error ?? "unknown error"}`);
        } else {
          setMsg("Cancellation requested. Access continues until the period ends.");
          // Refresh after a short delay so the server-rendered card updates.
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (e) {
        setMsg(`Cancel failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setCancellingId(null);
      }
    });
  };

  const hasActive = activeSubs.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            Subscription
          </div>
          <div className="mt-2 text-3xl font-semibold">
            {remainingDays != null
              ? `${remainingDays} days remaining`
              : "Inactive"}
          </div>
        </div>
      </div>

      {/* Active subscriptions list (multi-plan support) */}
      {hasActive && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active subscriptions
          </p>
          {activeSubs.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3"
            >
              <div>
                <div className="text-sm font-semibold">{s.planName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {s.cancelRequestedAt
                    ? `Cancels on ${new Date(s.currentPeriodEnd).toLocaleDateString()}`
                    : `Renews ${new Date(s.currentPeriodEnd).toLocaleDateString()}`}
                </div>
              </div>
              {s.cancelRequestedAt ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Cancellation pending
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => cancel(s.id)}
                  disabled={pending && cancellingId === s.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {pending && cancellingId === s.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Plan picker */}
      {plans.length > 0 ? (
        <>
          <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {hasActive ? "Add another plan" : "Choose a plan"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {plans.map((p) => {
              const wired = !!(p.externalProductSlug && p.externalPlanType);
              return (
                <label
                  key={p.id}
                  className={`relative cursor-pointer rounded-xl border p-4 transition ${
                    selectedPlan === p.id
                      ? "border-primary ring-2 ring-primary/20"
                      : "hover:bg-muted/30"
                  } ${!wired ? "opacity-60" : ""}`}
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
                    {formatPrice(p.priceCents, p.currency)}
                    <span className="ms-1 text-sm font-normal text-muted-foreground">
                      / {p.durationDays}d
                    </span>
                  </div>
                  {!wired && (
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      Not connected
                    </p>
                  )}
                </label>
              );
            })}
          </div>

          <button
            type="button"
            onClick={subscribe}
            disabled={pending || !selectedPlan}
            className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {hasActive ? "Subscribe to this plan" : "Subscribe now"}
          </button>
        </>
      ) : (
        <p className="mt-5 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
          No plans available yet. Ask an admin to create one.
        </p>
      )}

      {msg && (
        <p className="mt-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}
