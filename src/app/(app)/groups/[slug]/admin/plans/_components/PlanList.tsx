"use client";

import { useTransition } from "react";
import { updatePlanAction } from "@/server/actions/subscription";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  priceCents: number;
  currency: string;
  active: boolean;
};

// Currency code → display symbol. Falls back to the uppercase code when unknown.
const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
  egp: "E£",
  sar: "﷼",
  aed: "د.إ",
  kwd: "د.ك",
};

function formatPrice(priceCents: number, currency: string): string {
  const amount = (priceCents / 100).toFixed(2);
  const sym = CURRENCY_SYMBOLS[currency.toLowerCase()] ?? currency.toUpperCase();
  return `${sym}${amount}`;
}

export function PlanList({
  groupId,
  plans,
}: {
  groupId: string;
  plans: Plan[];
}) {
  const [pending, startTransition] = useTransition();

  if (plans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No plans configured yet.</p>
    );
  }

  const toggleActive = (planId: string, active: boolean) => {
    startTransition(async () => {
      await updatePlanAction({ groupId, planId, active: !active });
    });
  };

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Days</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="px-3 py-2 font-medium">{p.name}</td>
              <td className="px-3 py-2">{p.durationDays}d</td>
              <td className="px-3 py-2 tabular-nums">
                {formatPrice(p.priceCents, p.currency)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    p.active
                      ? "bg-green-500/10 text-green-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => toggleActive(p.id, p.active)}
                  disabled={pending}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {p.active ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
