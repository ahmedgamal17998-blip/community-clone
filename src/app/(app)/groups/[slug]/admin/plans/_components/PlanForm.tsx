"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { createPlanAction } from "@/server/actions/subscription";

const inputBase =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50";

// Common currencies with their symbol prefix for clarity.
const CURRENCIES: Array<{ code: string; label: string; symbol: string }> = [
  { code: "usd", label: "USD ($)", symbol: "$" },
  { code: "eur", label: "EUR (€)", symbol: "€" },
  { code: "gbp", label: "GBP (£)", symbol: "£" },
  { code: "egp", label: "EGP (E£)", symbol: "E£" },
  { code: "sar", label: "SAR (﷼)", symbol: "﷼" },
  { code: "aed", label: "AED (د.إ)", symbol: "د.إ" },
  { code: "kwd", label: "KWD (د.ك)", symbol: "د.ك" },
];

const PLAN_TYPES = [
  { value: "", label: "(none)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "3-months", label: "3 months" },
  { value: "6-months", label: "6 months" },
  { value: "yearly", label: "Yearly" },
];

export function PlanForm({ groupId }: { groupId: string }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [price, setPrice] = useState(29);
  const [currency, setCurrency] = useState("egp");
  const [description, setDescription] = useState("");
  const [extProductId, setExtProductId] = useState<string>("");
  const [extProductSlug, setExtProductSlug] = useState<string>("");
  const [extPlanType, setExtPlanType] = useState<string>("");
  const [saved, setSaved] = useState(false);

  const submit = () => {
    if (!name) return;
    setSaved(false);
    startTransition(async () => {
      await createPlanAction({
        groupId,
        name,
        description,
        durationDays: days,
        priceCents: Math.round(price * 100),
        currency,
        active: true,
        externalProductId: extProductId ? Number(extProductId) : null,
        externalProductSlug: extProductSlug || null,
        externalPlanType: extPlanType || null,
      });
      setName("");
      setDescription("");
      setExtProductId("");
      setExtProductSlug("");
      setExtPlanType("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const symbol =
    CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency.toUpperCase();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr_120px]">
        {/* Plan name */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Plan name
          </label>
          <input
            type="text"
            placeholder="e.g. Monthly Pro"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputBase}
          />
        </div>

        {/* Duration */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Duration (days)
          </label>
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className={inputBase}
          />
        </div>

        {/* Price */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Price
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-muted-foreground">
              {symbol}
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className={inputBase + " pl-9"}
            />
          </div>
        </div>

        {/* Currency */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Currency
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputBase}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Description <span className="font-normal">(optional)</span>
        </label>
        <textarea
          placeholder="What does this plan unlock for the member?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inputBase + " resize-y"}
        />
      </div>

      {/* Payment-system mapping */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Payment system mapping (optional)
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Link this plan to a Product + Plan in the Subscription-base
          payment system. Required to enable the Subscribe checkout button.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              External Product ID
            </label>
            <input
              type="number"
              min={1}
              placeholder="e.g. 1"
              value={extProductId}
              onChange={(e) => setExtProductId(e.target.value)}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              External Product Slug
            </label>
            <input
              type="text"
              placeholder="e.g. test-product"
              value={extProductSlug}
              onChange={(e) => setExtProductSlug(e.target.value)}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Plan Type
            </label>
            <select
              value={extPlanType}
              onChange={(e) => setExtPlanType(e.target.value)}
              className={inputBase}
            >
              {PLAN_TYPES.map((p) => (
                <option key={p.value || "none"} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !name}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create plan"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
