"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Hash, GraduationCap, Check, Layers } from "lucide-react";
import {
  updatePlanAction,
  setPlanResourcesAction,
} from "@/server/actions/subscription";
import { setPlanMappedTrackAction } from "@/server/actions/tracks";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  priceCents: number;
  currency: string;
  active: boolean;
  externalProductId: number | null;
  externalProductSlug: string | null;
  externalPlanType: string | null;
  mappedTrackId: string | null;
};

type Channel = { id: string; slug: string; name: string; tier: string; kind: string };
type Course = { id: string; slug: string; title: string; tier: string };
type Track = { id: string; name: string };

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
  channels,
  courses,
  tracks,
  tracksEnabled,
  resourcesByPlan,
}: {
  groupId: string;
  plans: Plan[];
  channels: Channel[];
  courses: Course[];
  tracks: Track[];
  tracksEnabled: boolean;
  resourcesByPlan: Record<
    string,
    { channelIds: string[]; courseIds: string[]; eventIds: string[] }
  >;
}) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const toggleExpanded = (planId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  return (
    <ul className="space-y-3">
      {plans.map((p) => {
        const isOpen = expanded.has(p.id);
        const initial = resourcesByPlan[p.id] ?? {
          channelIds: [],
          courseIds: [],
          eventIds: [],
        };
        const includedCount =
          initial.channelIds.length +
          initial.courseIds.length +
          initial.eventIds.length;

        return (
          <li
            key={p.id}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            {/* Top row: summary */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => toggleExpanded(p.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.durationDays} days · {formatPrice(p.priceCents, p.currency)}{" "}
                  · unlocks {includedCount} resource{includedCount === 1 ? "" : "s"}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  p.active
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {p.active ? "Active" : "Inactive"}
              </span>
              <button
                type="button"
                onClick={() => toggleActive(p.id, p.active)}
                disabled={pending}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                {p.active ? "Deactivate" : "Activate"}
              </button>
            </div>

            {/* Expanded — payment mapping + resource picker */}
            {isOpen && (
              <>
                <PlanMappingEditor groupId={groupId} plan={p} />
                {tracksEnabled && (
                  <PlanTrackPicker
                    groupId={groupId}
                    plan={p}
                    tracks={tracks}
                  />
                )}
                <PlanResourcePicker
                  groupId={groupId}
                  planId={p.id}
                  channels={channels}
                  courses={courses}
                  initial={initial}
                />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Payment-system mapping editor ───────────────────────────────────────────

const PLAN_TYPE_OPTIONS = [
  { value: "", label: "(none)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "3-months", label: "3 months" },
  { value: "6-months", label: "6 months" },
  { value: "yearly", label: "Yearly" },
];

function PlanMappingEditor({ groupId, plan }: { groupId: string; plan: Plan }) {
  const [pending, startTransition] = useTransition();
  // Price / duration (basic plan fields)
  const [name, setName] = useState(plan.name);
  const [days, setDays] = useState<number>(plan.durationDays);
  const [price, setPrice] = useState<number>(plan.priceCents / 100);
  // Payment-system mapping
  const [productId, setProductId] = useState<string>(
    plan.externalProductId != null ? String(plan.externalProductId) : "",
  );
  const [productSlug, setProductSlug] = useState(plan.externalProductSlug ?? "");
  const [planType, setPlanType] = useState(plan.externalPlanType ?? "");
  const [saved, setSaved] = useState(false);

  const sym =
    CURRENCY_SYMBOLS[plan.currency.toLowerCase()] ?? plan.currency.toUpperCase();

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await updatePlanAction({
        groupId,
        planId: plan.id,
        name,
        durationDays: days,
        priceCents: Math.round(price * 100),
        externalProductId: productId ? Number(productId) : null,
        externalProductSlug: productSlug || null,
        externalPlanType: planType || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const inputCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="border-t border-border bg-card px-4 py-4 space-y-5">
      {/* ─── Plan basics: name + price + duration ─── */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plan basics
        </p>
        <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Duration (days)
            </label>
            <input
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Price ({sym})
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className={inputCls}
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          ⚠️ <b>Duration must match what your payment system charges for.</b>{" "}
          If Paymob bills monthly (30 days), don't set this to 60 — members
          would get 2 months access for 1 month payment.
        </p>
      </div>

      {/* ─── Payment-system mapping ─── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payment system mapping
          </p>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Set Product ID + Plan Type so we can match incoming webhooks to
          this plan. Slug is required to redirect members to the checkout
          page.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_1fr_auto]">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Product ID
            </label>
            <input
              type="number"
              min={1}
              placeholder="e.g. 1"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Product Slug
            </label>
            <input
              type="text"
              placeholder="e.g. test-product"
              value={productSlug}
              onChange={(e) => setProductSlug(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Plan Type
            </label>
            <select
              value={planType}
              onChange={(e) => setPlanType(e.target.value)}
              className={inputCls}
            >
              {PLAN_TYPE_OPTIONS.map((p) => (
                <option key={p.value || "none"} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save all"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Resource picker for a single plan ───────────────────────────────────────

function PlanResourcePicker({
  groupId,
  planId,
  channels,
  courses,
  initial,
}: {
  groupId: string;
  planId: string;
  channels: Channel[];
  courses: Course[];
  initial: { channelIds: string[]; courseIds: string[]; eventIds: string[] };
}) {
  const [pending, startTransition] = useTransition();
  const [channelIds, setChannelIds] = useState<Set<string>>(
    () => new Set(initial.channelIds),
  );
  const [courseIds, setCourseIds] = useState<Set<string>>(
    () => new Set(initial.courseIds),
  );
  const [saved, setSaved] = useState(false);

  const toggle = (
    set: Set<string>,
    setSet: (v: Set<string>) => void,
    id: string,
  ) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await setPlanResourcesAction({
        groupId,
        planId,
        channelIds: [...channelIds],
        courseIds: [...courseIds],
        eventIds: [], // events covered by M23 audience system
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Pick the channels and courses unlocked by this plan. Subscribers get
        access to exactly these resources for the plan's duration.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ResourceColumn
          title="Channels"
          icon={<Hash className="h-3.5 w-3.5" />}
          items={channels.map((c) => ({
            id: c.id,
            label: `#${c.slug}`,
            badge: c.tier === "PREMIUM" ? "PREMIUM" : null,
          }))}
          selected={channelIds}
          onToggle={(id) => toggle(channelIds, setChannelIds, id)}
        />

        <ResourceColumn
          title="Courses"
          icon={<GraduationCap className="h-3.5 w-3.5" />}
          items={courses.map((c) => ({
            id: c.id,
            label: c.title,
            badge: c.tier === "PREMIUM" ? "PREMIUM" : null,
          }))}
          selected={courseIds}
          onToggle={(id) => toggle(courseIds, setCourseIds, id)}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save included resources"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
            <Check className="h-3.5 w-3.5" />
            Saved — applied to active subscribers
          </span>
        )}
      </div>
    </div>
  );
}

function ResourceColumn({
  title,
  icon,
  items,
  selected,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{ id: string; label: string; badge: string | null }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="text-[10px] font-normal normal-case">
          ({selected.size}/{items.length})
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-card/40 p-3 text-center text-[11px] text-muted-foreground">
          None yet
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const checked = selected.has(it.id);
            return (
              <li key={it.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(it.id)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.badge && (
                    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                      {it.badge}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Plan → Track auto-assignment ────────────────────────────────────────────

function PlanTrackPicker({
  groupId,
  plan,
  tracks,
}: {
  groupId: string;
  plan: Plan;
  tracks: Track[];
}) {
  const [pending, startTransition] = useTransition();
  const [trackId, setTrackId] = useState<string>(plan.mappedTrackId ?? "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await setPlanMappedTrackAction({
        groupId,
        planId: plan.id,
        trackId: trackId || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const inputCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  const dirty = (plan.mappedTrackId ?? "") !== trackId;

  return (
    <div className="border-t border-border bg-card px-4 py-4">
      <div className="mb-2 flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Auto-assign track
        </p>
        {saved && (
          <span className="ms-auto inline-flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
            <Check className="h-3 w-3" />
            Saved
          </span>
        )}
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        When someone subscribes to this plan, automatically place them on the
        chosen track. Honors the group's promotion mode (replace vs stack).
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <select
          value={trackId}
          onChange={(e) => setTrackId(e.target.value)}
          className={inputCls}
        >
          <option value="">— No track auto-assignment —</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
