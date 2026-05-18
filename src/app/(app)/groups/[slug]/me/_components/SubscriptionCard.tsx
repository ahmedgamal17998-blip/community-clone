"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import { subscribeAction } from "@/server/subscriptions";

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = {
  id: string;
  name: string;
  durationDays: number;
  priceCents: number;
  currency: string;
  externalProductSlug: string | null;
  externalProductId: string | null;
};

type PaymentMethod = {
  id: string;
  type: string;
  label: string;
  instructions: string | null;
  accountDetails: string | null;
  isDefault: boolean;
};

type ActiveSub = {
  id: string;
  planName: string;
  currentPeriodEnd: Date;
  cancelRequestedAt: Date | null;
  hasExternal: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$", eur: "€", gbp: "£", egp: "E£",
  sar: "﷼", aed: "د.إ", kwd: "د.ك",
};

function formatPrice(priceCents: number, currency: string) {
  const sym = CURRENCY_SYMBOLS[currency.toLowerCase()] ?? currency.toUpperCase();
  return `${sym}${(priceCents / 100).toFixed(2)}`;
}

/** Automated gateways that redirect to external checkout */
function isAutomated(type: string) {
  return type === "SUBSCRIPTION_BASE" || type === "STRIPE" || type === "PAYMOB";
}

/** Automated methods need the plan to have an external product slug/id */
function methodCanHandlePlan(method: PaymentMethod, plan: Plan): boolean {
  if (method.type.startsWith("MANUAL_")) return true;
  return !!(plan.externalProductSlug || plan.externalProductId);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SubscriptionCard({
  remainingDays,
  activeSubs,
  plans,
  groupId,
  paymentMethods,
}: {
  remainingDays: number | null;
  activeSubs: ActiveSub[];
  plans: Plan[];
  groupId: string;
  paymentMethods: PaymentMethod[];
}) {
  const [pending, startTransition] = useTransition();
  const [selectedPlan, setSelectedPlan]     = useState(plans[0]?.id ?? "");
  const [selectedMethod, setSelectedMethod] = useState(paymentMethods[0]?.id ?? "");
  const [paymentRef, setPaymentRef]         = useState("");
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [cancellingId, setCancellingId]     = useState<string | null>(null);

  const currentPlan   = plans.find((p) => p.id === selectedPlan);
  const currentMethod = paymentMethods.find((m) => m.id === selectedMethod);
  const hasActive     = activeSubs.length > 0;

  // ── Subscribe ───────────────────────────────────────────────────────────────
  const subscribe = () => {
    if (!currentPlan || !currentMethod) return;

    if (isAutomated(currentMethod.type) && !methodCanHandlePlan(currentMethod, currentPlan)) {
      setMsg({
        type: "error",
        text: "This plan isn't linked to the payment system yet. Ask an admin to set the External Product Slug in admin → Plans.",
      });
      return;
    }

    setMsg(null);
    startTransition(async () => {
      const result = await subscribeAction({
        groupId,
        planId: selectedPlan,
        paymentMethodId: selectedMethod,
        paymentRef: paymentRef.trim() || undefined,
      });

      if (!result.ok) {
        setMsg({ type: "error", text: result.error });
        return;
      }

      if (result.status === "REDIRECT" && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }

      if (result.status === "PENDING_APPROVAL") {
        setMsg({ type: "success", text: "Request submitted! Awaiting admin approval." });
        setTimeout(() => window.location.reload(), 2000);
        return;
      }

      // ACTIVE (free/automated)
      window.location.reload();
    });
  };

  // ── Cancel ──────────────────────────────────────────────────────────────────
  const cancel = (subscriptionId: string) => {
    if (!confirm("Cancel this subscription? Access will continue until the current period ends.")) return;
    setCancellingId(subscriptionId);
    setMsg(null);
    startTransition(async () => {
      try {
        const res  = await fetch("/api/payments/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) {
          setMsg({ type: "error", text: `Cancel failed: ${data.error ?? "unknown error"}` });
        } else {
          setMsg({ type: "success", text: "Cancellation requested. Access continues until the period ends." });
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (e) {
        setMsg({ type: "error", text: `Cancel failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        setCancellingId(null);
      }
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">

      {/* Status header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            Subscription
          </div>
          <div className="mt-2 text-3xl font-semibold">
            {remainingDays != null ? `${remainingDays} days remaining` : "Inactive"}
          </div>
        </div>
      </div>

      {/* Active subscriptions */}
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
                  {pending && cancellingId === s.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : null}
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Plan + payment flow */}
      {plans.length > 0 ? (
        <>
          {/* ── Step 1: Plan selection ── */}
          <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {hasActive ? "Add another plan" : "Choose a plan"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {plans.map((p) => (
              <label
                key={p.id}
                className={`relative cursor-pointer rounded-xl border p-4 transition ${
                  selectedPlan === p.id
                    ? "border-primary ring-2 ring-primary/20"
                    : "hover:bg-muted/30"
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.id}
                  checked={selectedPlan === p.id}
                  onChange={() => { setSelectedPlan(p.id); setMsg(null); }}
                  className="hidden"
                />
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 text-2xl font-bold">
                  {formatPrice(p.priceCents, p.currency)}
                  <span className="ms-1 text-sm font-normal text-muted-foreground">
                    / {p.durationDays}d
                  </span>
                </div>
              </label>
            ))}
          </div>

          {/* ── Step 2: Payment method selection ── */}
          {paymentMethods.length > 0 ? (
            <>
              <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payment method
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {paymentMethods.map((m) => {
                  const canUse = currentPlan ? methodCanHandlePlan(m, currentPlan) : false;
                  return (
                    <label
                      key={m.id}
                      className={`relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        !canUse
                          ? "cursor-not-allowed opacity-40"
                          : selectedMethod === m.id
                          ? "border-primary ring-2 ring-primary/20"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="method"
                        value={m.id}
                        checked={selectedMethod === m.id}
                        disabled={!canUse}
                        onChange={() => { if (canUse) { setSelectedMethod(m.id); setMsg(null); } }}
                        className="hidden"
                      />
                      <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.label}</p>
                        {!canUse && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Not available for this plan
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Manual payment instructions */}
              {currentMethod?.type.startsWith("MANUAL_") && (
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  {currentMethod.instructions && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Payment instructions
                      </p>
                      <p className="text-sm whitespace-pre-line">{currentMethod.instructions}</p>
                    </div>
                  )}
                  {currentMethod.accountDetails && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Account details
                      </p>
                      <p className="rounded bg-muted px-2 py-1 font-mono text-sm">
                        {currentMethod.accountDetails}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Payment reference <span className="font-normal normal-case">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      placeholder="Transaction ID, receipt number, etc."
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={subscribe}
                disabled={pending || !selectedPlan || !selectedMethod}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing…
                  </span>
                ) : isAutomated(currentMethod?.type ?? "") ? (
                  "Continue to payment →"
                ) : hasActive ? (
                  "Subscribe to this plan"
                ) : (
                  "Subscribe now"
                )}
              </button>
            </>
          ) : (
            <p className="mt-5 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              No payment methods configured yet. Contact the group admin.
            </p>
          )}
        </>
      ) : (
        <p className="mt-5 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
          No plans available yet. Ask an admin to create one.
        </p>
      )}

      {/* Feedback message */}
      {msg && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg p-3 text-sm ${
          msg.type === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
        }`}>
          {msg.type === "error"
            ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
