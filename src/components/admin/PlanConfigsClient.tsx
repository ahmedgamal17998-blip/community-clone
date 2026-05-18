"use client";

import { useState, useTransition } from "react";
import { Pencil, RotateCcw, Save, X, Plus, Trash2, Check, Eye, EyeOff } from "lucide-react";
import { updatePlanConfigAction, resetPlanConfigAction } from "@/server/plan-configs";
import type { PlanConfigRow, UpdatePlanInput } from "@/server/plan-configs";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** dollars → cents for storage */
const toCents = (dollars: number) => Math.round(dollars * 100);
/** cents → dollars for display */
const toDollars = (cents: number) => cents / 100;

function limitDisplay(n: number): string {
  return n === -1 ? "∞" : String(n);
}

// ─── Feature list editor ──────────────────────────────────────────────────────

function FeatureListEditor({ features, onChange }: { features: string[]; onChange: (f: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...features, t]);
    setDraft("");
  };
  const remove = (i: number) => onChange(features.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {features.map((f, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-sm">
          <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
          <span className="flex-1 text-xs">{f}</span>
          <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          type="text" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add feature… (Enter to add)"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button type="button" onClick={add}
          className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium hover:bg-primary/10 transition-colors">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Limit field with unlimited checkbox ──────────────────────────────────────

function LimitField({ label, value, onChange, allowUnlimited = true }: {
  label: string; value: number; onChange: (n: number) => void; allowUnlimited?: boolean;
}) {
  const isUnlimited = value === -1;
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min={allowUnlimited ? -1 : 0} disabled={isUnlimited}
          value={isUnlimited ? "" : value}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
          placeholder={isUnlimited ? "∞" : ""}
          className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary disabled:bg-muted disabled:opacity-60"
        />
        {allowUnlimited && (
          <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground select-none">
            <input type="checkbox" checked={isUnlimited}
              onChange={(e) => onChange(e.target.checked ? -1 : 1)}
              className="accent-primary"
            /> ∞
          </label>
        )}
      </div>
    </div>
  );
}

// ─── Plan card styles ─────────────────────────────────────────────────────────

const PLAN_ORDER: Record<string, number> = { STARTER: 0, PRO: 1, BUSINESS: 2 };
const CARD_STYLE: Record<string, string> = {
  STARTER:  "border-border bg-card",
  PRO:      "border-primary/30 bg-primary/[0.03]",
  BUSINESS: "border-violet-300/40 bg-violet-50/50 dark:bg-violet-900/10",
};
const BADGE_STYLE: Record<string, string> = {
  STARTER:  "bg-muted text-muted-foreground",
  PRO:      "bg-primary/10 text-primary",
  BUSINESS: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

// ─── Single plan card ─────────────────────────────────────────────────────────

function PlanCard({ row, onUpdated }: { row: PlanConfigRow; onUpdated: (u: PlanConfigRow) => void }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Draft stores prices as DOLLARS (UX), converted to cents on save
  const [draft, setDraft] = useState<UpdatePlanInput & { monthlyDollars: number; yearlyDollars: number }>({
    label:              row.label,
    monthlyPriceCents:  row.monthlyPriceCents,
    yearlyPriceCents:   row.yearlyPriceCents,
    monthlyDollars:     toDollars(row.monthlyPriceCents),
    yearlyDollars:      toDollars(row.yearlyPriceCents),
    maxGroups:          row.maxGroups,
    maxMembersPerGroup: row.maxMembersPerGroup,
    maxCourses:         row.maxCourses,
    maxTeamMembers:     row.maxTeamMembers,
    maxStorageGb:       row.maxStorageGb,
    features:           row.features,
    isVisible:          row.isVisible,
    sortOrder:          row.sortOrder,
  });

  const set = <K extends keyof typeof draft>(k: K, v: typeof draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const startEdit = () => {
    setDraft({
      label:              row.label,
      monthlyPriceCents:  row.monthlyPriceCents,
      yearlyPriceCents:   row.yearlyPriceCents,
      monthlyDollars:     toDollars(row.monthlyPriceCents),
      yearlyDollars:      toDollars(row.yearlyPriceCents),
      maxGroups:          row.maxGroups,
      maxMembersPerGroup: row.maxMembersPerGroup,
      maxCourses:         row.maxCourses,
      maxTeamMembers:     row.maxTeamMembers,
      maxStorageGb:       row.maxStorageGb,
      features:           row.features,
      isVisible:          row.isVisible,
      sortOrder:          row.sortOrder,
    });
    setError(null);
    setEditing(true);
  };

  const save = () => {
    setError(null);
    const payload: UpdatePlanInput = {
      label:              draft.label,
      monthlyPriceCents:  toCents(draft.monthlyDollars),
      yearlyPriceCents:   toCents(draft.yearlyDollars),
      maxGroups:          draft.maxGroups,
      maxMembersPerGroup: draft.maxMembersPerGroup,
      maxCourses:         draft.maxCourses,
      maxTeamMembers:     draft.maxTeamMembers,
      maxStorageGb:       draft.maxStorageGb,
      features:           draft.features,
      isVisible:          draft.isVisible,
      sortOrder:          draft.sortOrder,
    };
    startTransition(async () => {
      const res = await updatePlanConfigAction(row.plan, payload);
      if (!res.ok) { setError(res.error); return; }
      onUpdated({ ...row, ...payload });
      setEditing(false);
    });
  };

  const reset = () => {
    startTransition(async () => {
      const res = await resetPlanConfigAction(row.plan);
      if (!res.ok) { setError(res.error); return; }
      window.location.reload();
    });
  };

  return (
    <div className={`rounded-2xl border p-5 ${CARD_STYLE[row.plan] ?? "border-border bg-card"} flex flex-col`}>
      {/* Header row */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className={`self-start rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE_STYLE[row.plan] ?? "bg-muted text-muted-foreground"}`}>
            {row.plan}
          </span>
          {!editing && <p className="text-lg font-bold">{row.label}</p>}
          {!row.isVisible && (
            <span className="self-start rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
              hidden from pricing
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!editing ? (
            <>
              <button onClick={startEdit}
                className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors">
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button onClick={reset} disabled={pending} title="Reset to defaults"
                className="rounded-lg bg-muted p-1.5 text-xs hover:bg-amber-100 hover:text-amber-700 transition-colors disabled:opacity-40">
                <RotateCcw className="h-3 w-3" />
              </button>
            </>
          ) : (
            <>
              <button onClick={save} disabled={pending}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Save className="h-3 w-3" /> {pending ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} disabled={pending}
                className="rounded-lg bg-muted p-1.5 hover:bg-muted/80">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {editing ? (
        /* ── Edit panel ── */
        <div className="space-y-4 text-sm">
          {/* Label */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Display name</label>
            <input type="text" value={draft.label} onChange={(e) => set("label", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary" />
          </div>

          {/* Pricing — dollar inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Monthly ($)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" min={0} step={0.01}
                  value={draft.monthlyDollars}
                  onChange={(e) => set("monthlyDollars", parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border bg-background pl-6 pr-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Yearly ($)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" min={0} step={0.01}
                  value={draft.yearlyDollars}
                  onChange={(e) => set("yearlyDollars", parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border bg-background pl-6 pr-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
            </div>
          </div>

          {/* Limits */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Limits (−1 or ∞ = unlimited)</p>
            <div className="grid grid-cols-2 gap-3">
              <LimitField label="Max groups"          value={draft.maxGroups}          onChange={(n) => set("maxGroups", n)} />
              <LimitField label="Max members / group" value={draft.maxMembersPerGroup} onChange={(n) => set("maxMembersPerGroup", n)} />
              <LimitField label="Max courses"         value={draft.maxCourses}         onChange={(n) => set("maxCourses", n)} />
              <LimitField label="Max team seats"      value={draft.maxTeamMembers}     onChange={(n) => set("maxTeamMembers", n)} allowUnlimited={false} />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Storage (GB)</label>
              <input type="number" min={1} value={draft.maxStorageGb}
                onChange={(e) => set("maxStorageGb", parseInt(e.target.value, 10) || 1)}
                className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
            </div>
          </div>

          {/* Features */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Features list</p>
            <FeatureListEditor features={draft.features} onChange={(f) => set("features", f)} />
          </div>

          {/* Visibility */}
          <label className="flex cursor-pointer items-center gap-2 text-xs select-none">
            <input type="checkbox" checked={draft.isVisible}
              onChange={(e) => set("isVisible", e.target.checked)}
              className="accent-primary" />
            Show on public pricing page
          </label>
        </div>
      ) : (
        /* ── View panel ── */
        <div className="flex flex-1 flex-col space-y-4">
          {/* Price */}
          <div>
            <p className="text-2xl font-bold">
              {row.monthlyPriceCents === 0
                ? "Free"
                : `$${toDollars(row.monthlyPriceCents).toFixed(0)}`}
              {row.monthlyPriceCents > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
            </p>
            {row.yearlyPriceCents > 0 && (
              <p className="text-xs text-muted-foreground">${toDollars(row.yearlyPriceCents).toFixed(0)}/yr</p>
            )}
          </div>

          {/* Limits grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {[
              ["Groups",         limitDisplay(row.maxGroups)],
              ["Members/group",  limitDisplay(row.maxMembersPerGroup)],
              ["Courses",        limitDisplay(row.maxCourses)],
              ["Team seats",     String(row.maxTeamMembers)],
              ["Storage",        `${row.maxStorageGb} GB`],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between border-b border-border/60 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold">{val}</span>
              </div>
            ))}
          </div>

          {/* Features */}
          <ul className="flex-1 space-y-1.5">
            {row.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />{f}
              </li>
            ))}
          </ul>

          {/* Visibility indicator */}
          <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
            {row.isVisible
              ? <><Eye className="h-3 w-3" /> Visible on pricing page</>
              : <><EyeOff className="h-3 w-3" /> Hidden from pricing page</>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function PlanConfigsClient({ initialRows }: { initialRows: PlanConfigRow[] }) {
  const [rows, setRows] = useState(
    [...initialRows].sort((a, b) => (PLAN_ORDER[a.plan] ?? 99) - (PLAN_ORDER[b.plan] ?? 99)),
  );
  const handleUpdated = (u: PlanConfigRow) =>
    setRows((prev) => prev.map((r) => (r.plan === u.plan ? u : r)));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 sm:grid-cols-1">
      {rows.map((row) => (
        <PlanCard key={row.plan} row={row} onUpdated={handleUpdated} />
      ))}
    </div>
  );
}
