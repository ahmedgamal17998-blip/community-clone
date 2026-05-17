/**
 * /onboarding — New tenant onboarding wizard.
 *
 * 5-step flow:
 *   1. Workspace name + slug (Tenant)
 *   2. Community name + slug
 *   3. First Group name + slug + visibility
 *   4. Payment method setup (optional — can skip, add later)
 *   5. Review + launch
 *
 * On submit, calls createTenantAction() which creates Tenant + Community +
 * Group + GroupMembership atomically, then redirects to the new group.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, Users, Globe, Lock, CreditCard,
  Rocket, ChevronRight, ChevronLeft, Check,
  Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createTenantAction, type CreateTenantInput } from "@/server/tenant";

// ─── Slug helper ─────────────────────────────────────────────────────────────

function slugify(val: string) {
  return val
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { icon: Building2, label: "Workspace" },
  { icon: Globe, label: "Community" },
  { icon: Users, label: "Group" },
  { icon: CreditCard, label: "Payments" },
  { icon: Rocket, label: "Launch" },
];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all",
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "border-2 border-primary text-primary"
                  : "border border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-8 transition-all",
                  i < step ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Input component ─────────────────────────────────────────────────────────

function Field({
  label, id, value, onChange, placeholder, hint, error, prefix,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  prefix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className={cn("flex items-center rounded-xl border bg-background px-3 py-2", error && "border-destructive")}>
        {prefix && <span className="mr-1 text-sm text-muted-foreground">{prefix}</span>}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  // Form state
  const [tenantName,    setTenantName]    = useState("");
  const [tenantSlug,    setTenantSlug]    = useState("");
  const [communityName, setCommunityName] = useState("");
  const [communitySlug, setCommunitySlug] = useState("");
  const [tagline,       setTagline]       = useState("");
  const [groupName,     setGroupName]     = useState("");
  const [groupSlug,     setGroupSlug]     = useState("");
  const [visibility,    setVisibility]    = useState<"PUBLIC" | "PRIVATE" | "HIDDEN">("PUBLIC");

  // Auto-generate slugs from names
  function handleTenantName(v: string) {
    setTenantName(v);
    if (!tenantSlug || tenantSlug === slugify(tenantName)) setTenantSlug(slugify(v));
  }
  function handleCommunityName(v: string) {
    setCommunityName(v);
    if (!communitySlug || communitySlug === slugify(communityName)) setCommunitySlug(slugify(v));
  }
  function handleGroupName(v: string) {
    setGroupName(v);
    if (!groupSlug || groupSlug === slugify(groupName)) setGroupSlug(slugify(v));
  }

  function next() { setError(null); setStep((s) => s + 1); }
  function back() { setError(null); setStep((s) => s - 1); }

  // Per-step validation
  function validateStep(): boolean {
    setError(null);
    if (step === 0) {
      if (!tenantName.trim()) { setError({ field: "tenantName", message: "Workspace name is required" }); return false; }
      if (!tenantSlug.trim()) { setError({ field: "tenantSlug", message: "Workspace URL is required" }); return false; }
      if (!/^[a-z0-9-]+$/.test(tenantSlug)) { setError({ field: "tenantSlug", message: "Lowercase letters, numbers and hyphens only" }); return false; }
    }
    if (step === 1) {
      if (!communityName.trim()) { setError({ field: "communityName", message: "Community name is required" }); return false; }
      if (!communitySlug.trim()) { setError({ field: "communitySlug", message: "Community URL is required" }); return false; }
      if (!/^[a-z0-9-]+$/.test(communitySlug)) { setError({ field: "communitySlug", message: "Lowercase letters, numbers and hyphens only" }); return false; }
    }
    if (step === 2) {
      if (!groupName.trim()) { setError({ field: "groupName", message: "Group name is required" }); return false; }
      if (!groupSlug.trim()) { setError({ field: "groupSlug", message: "Group URL is required" }); return false; }
      if (!/^[a-z0-9-]+$/.test(groupSlug)) { setError({ field: "groupSlug", message: "Lowercase letters, numbers and hyphens only" }); return false; }
    }
    return true;
  }

  function handleNext() {
    if (!validateStep()) return;
    if (step < 4) { next(); return; }
    // Step 4 = launch
    handleSubmit();
  }

  function handleSubmit() {
    const input: CreateTenantInput = {
      tenantName, tenantSlug, communityName, communitySlug,
      tagline: tagline || undefined,
      groupName, groupSlug, visibility,
    };
    startTransition(async () => {
      const result = await createTenantAction(input);
      if (!result.ok) {
        setError(result.error);
        // Navigate back to the relevant step
        if (result.error.field?.includes("tenant")) setStep(0);
        else if (result.error.field?.includes("community")) setStep(1);
        else if (result.error.field?.includes("group")) setStep(2);
      }
      // On success, createTenantAction calls redirect() so we never reach here
    });
  }

  const fieldError = (field: string) =>
    error?.field === field ? error.message : undefined;

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Set up your workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === 0 && "Choose a name for your Nadi workspace."}
          {step === 1 && "Create your first community — a home for your groups."}
          {step === 2 && "Add your first group where members will gather."}
          {step === 3 && "Set up how members will pay to join (optional — skip for now)."}
          {step === 4 && "Everything looks good. Hit Launch to go live!"}
        </p>
      </div>

      <StepIndicator step={step} />

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
        {/* ── Step 0: Workspace ── */}
        {step === 0 && (
          <div className="space-y-4">
            <Field
              label="Workspace name"
              id="tenantName"
              value={tenantName}
              onChange={handleTenantName}
              placeholder="Acme Academy"
              hint="Your organisation or brand name."
              error={fieldError("tenantName")}
            />
            <Field
              label="Workspace URL"
              id="tenantSlug"
              value={tenantSlug}
              onChange={setTenantSlug}
              placeholder="acme-academy"
              hint="acme-academy.nadi.app — this cannot be changed later."
              prefix="nadi.app/"
              error={fieldError("tenantSlug")}
            />
          </div>
        )}

        {/* ── Step 1: Community ── */}
        {step === 1 && (
          <div className="space-y-4">
            <Field
              label="Community name"
              id="communityName"
              value={communityName}
              onChange={handleCommunityName}
              placeholder="Acme Community"
              hint="The public name of your community hub."
              error={fieldError("communityName")}
            />
            <Field
              label="Community URL"
              id="communitySlug"
              value={communitySlug}
              onChange={setCommunitySlug}
              placeholder="acme-community"
              prefix="nadi.app/c/"
              error={fieldError("communitySlug")}
            />
            <Field
              label="Tagline (optional)"
              id="tagline"
              value={tagline}
              onChange={setTagline}
              placeholder="A short description of your community"
              hint="Up to 120 characters. Shown on the community landing page."
            />
          </div>
        )}

        {/* ── Step 2: Group ── */}
        {step === 2 && (
          <div className="space-y-4">
            <Field
              label="Group name"
              id="groupName"
              value={groupName}
              onChange={handleGroupName}
              placeholder="General"
              hint="Your first group — more can be added later."
              error={fieldError("groupName")}
            />
            <Field
              label="Group URL"
              id="groupSlug"
              value={groupSlug}
              onChange={setGroupSlug}
              placeholder="general"
              prefix="nadi.app/groups/"
              error={fieldError("groupSlug")}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">Visibility</p>
              {(["PUBLIC", "PRIVATE", "HIDDEN"] as const).map((v) => (
                <label
                  key={v}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                    visibility === v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={visibility === v}
                    onChange={() => setVisibility(v)}
                  />
                  {v === "PUBLIC" && <Globe className="h-4 w-4 text-primary" />}
                  {v === "PRIVATE" && <Lock className="h-4 w-4 text-muted-foreground" />}
                  {v === "HIDDEN" && <Lock className="h-4 w-4 text-destructive/70" />}
                  <div>
                    <p className="text-sm font-medium capitalize">{v.toLowerCase()}</p>
                    <p className="text-xs text-muted-foreground">
                      {v === "PUBLIC" && "Anyone can discover and join."}
                      {v === "PRIVATE" && "Discoverable, but requires approval to join."}
                      {v === "HIDDEN" && "Invisible — invite-only."}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Payments ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-5 text-center">
              <CreditCard className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Payment methods</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You can configure Vodafone Cash, InstaPay, Paymob, Stripe and more after
                launch from your admin panel. Skip for now to use your workspace for free.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Review + Launch ── */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Review your setup</p>
            {[
              { label: "Workspace",  value: `${tenantName} (nadi.app/${tenantSlug})` },
              { label: "Community",  value: `${communityName} (/c/${communitySlug})` },
              { label: "First group",value: `${groupName} (/groups/${groupSlug}) · ${visibility.toLowerCase()}` },
              { label: "Trial ends", value: new Date(Date.now() + 14 * 86400000).toLocaleDateString() },
            ].map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-2 rounded-xl bg-muted/50 px-4 py-2.5">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className="text-right text-xs font-medium">{r.value}</span>
              </div>
            ))}
            {error && !error.field && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {error.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <Button
          variant="ghost"
          onClick={step === 3 ? next : back}
          disabled={step === 0 || isPending}
          className="gap-1.5"
        >
          {step === 3 ? (
            <>Skip <ChevronRight className="h-4 w-4" /></>
          ) : (
            <><ChevronLeft className="h-4 w-4" /> Back</>
          )}
        </Button>
        <Button onClick={handleNext} disabled={isPending} className="gap-2 min-w-[120px]">
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
          ) : step === 4 ? (
            <><Rocket className="h-4 w-4" /> Launch</>
          ) : (
            <>Next <ChevronRight className="h-4 w-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}
