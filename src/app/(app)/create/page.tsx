"use client";

/**
 * /create — 3-step wizard: community details → first group → done.
 * Pure client component; calls `createCommunityAction` on submit.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Building2,
  Users,
} from "lucide-react";
import { createCommunityAction } from "@/server/community";
import type { CreateCommunityInput, CreateCommunityError } from "@/server/community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function slugify(v: string) {
  return v
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

const STEPS = ["Community", "First group", "Done"] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export default function CreateCommunityPage() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0); // 0=community, 1=group
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<CreateCommunityError | null>(null);

  // Community fields
  const [communityName, setCommunityName] = useState("");
  const [communitySlug, setCommunitySlug] = useState("");
  const [tagline, setTagline] = useState("");

  // Group fields
  const [groupName, setGroupName] = useState("");
  const [groupSlug, setGroupSlug] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE" | "HIDDEN">("PUBLIC");

  // Auto-slug helpers
  function handleCommunityNameChange(v: string) {
    setCommunityName(v);
    setCommunitySlug(slugify(v));
  }
  function handleGroupNameChange(v: string) {
    setGroupName(v);
    setGroupSlug(slugify(v));
  }

  // Step 0 → 1: basic validation
  function toGroupStep() {
    if (communityName.trim().length < 2) {
      setError({ field: "communityName", message: "Community name must be at least 2 characters." });
      return;
    }
    if (!communitySlug || communitySlug.length < 2) {
      setError({ field: "communitySlug", message: "Community URL must be at least 2 characters." });
      return;
    }
    setError(null);
    setStep(1);
  }

  // Step 1 → submit
  function handleSubmit() {
    if (groupName.trim().length < 2) {
      setError({ field: "groupName", message: "Group name must be at least 2 characters." });
      return;
    }
    if (!groupSlug || groupSlug.length < 2) {
      setError({ field: "groupSlug", message: "Group URL must be at least 2 characters." });
      return;
    }
    setError(null);

    const payload: CreateCommunityInput = {
      communityName: communityName.trim(),
      communitySlug,
      tagline: tagline.trim() || undefined,
      groupName: groupName.trim(),
      groupSlug,
      visibility,
    };

    startTransition(async () => {
      const res = await createCommunityAction(payload);
      if (!res.ok) {
        setError(res.error);
        // If error is about community fields, go back to step 0
        if (
          res.error.field === "communityName" ||
          res.error.field === "communitySlug"
        ) {
          setStep(0);
        }
      }
      // On success the server action calls redirect() — no client navigation needed.
    });
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      {/* ── Stepper ── */}
      <div className="mb-8 flex items-center gap-0">
        {STEPS.map((label, i) => {
          const done = i < step || (i === 1 && isPending);
          const active = i === step && !isPending;
          return (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "border-2 border-primary bg-transparent text-primary"
                        : "border-2 border-muted bg-transparent text-muted-foreground",
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mb-4 h-0.5 flex-1",
                    i < step ? "bg-primary" : "bg-muted",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Step 0: Community details ── */}
      {step === 0 && (
        <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Name your community</h1>
              <p className="text-sm text-muted-foreground">
                This is the brand that holds all your groups.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="communityName">Community name *</Label>
            <Input
              id="communityName"
              value={communityName}
              onChange={(e) => handleCommunityNameChange(e.target.value)}
              placeholder="e.g. Acme Academy"
              maxLength={60}
              className={error?.field === "communityName" ? "border-destructive" : ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="communitySlug">Community URL *</Label>
            <div className="flex items-center gap-0 overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
              <span className="shrink-0 border-e border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                nadi.app/c/
              </span>
              <Input
                id="communitySlug"
                value={communitySlug}
                onChange={(e) =>
                  setCommunitySlug(slugify(e.target.value))
                }
                placeholder="acme-academy"
                maxLength={40}
                className={cn(
                  "rounded-none border-0 focus-visible:ring-0",
                  error?.field === "communitySlug" ? "text-destructive" : "",
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tagline">Tagline <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Learn, grow and connect."
              maxLength={120}
            />
          </div>

          {error && (error.field === "communityName" || error.field === "communitySlug") && (
            <p className="text-sm text-destructive" role="alert">{error.message}</p>
          )}

          <div className="flex justify-end">
            <Button onClick={toGroupStep} className="gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 1: First group ── */}
      {step === 1 && (
        <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Create your first group</h1>
              <p className="text-sm text-muted-foreground">
                Inside <strong>{communityName}</strong>. You can add more groups later.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="groupName">Group name *</Label>
            <Input
              id="groupName"
              value={groupName}
              onChange={(e) => handleGroupNameChange(e.target.value)}
              placeholder="e.g. English Beginners"
              maxLength={60}
              className={error?.field === "groupName" ? "border-destructive" : ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="groupSlug">Group URL *</Label>
            <div className="flex items-center gap-0 overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
              <span className="shrink-0 border-e border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                nadi.app/groups/
              </span>
              <Input
                id="groupSlug"
                value={groupSlug}
                onChange={(e) => setGroupSlug(slugify(e.target.value))}
                placeholder="english-beginners"
                maxLength={40}
                className={cn(
                  "rounded-none border-0 focus-visible:ring-0",
                  error?.field === "groupSlug" ? "text-destructive" : "",
                )}
              />
            </div>
          </div>

          {/* Visibility */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Visibility</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  { value: "PUBLIC",  label: "Public",  hint: "Anyone can join",          Icon: Globe    },
                  { value: "PRIVATE", label: "Private", hint: "Approval required",         Icon: Lock     },
                  { value: "HIDDEN",  label: "Hidden",  hint: "Invite only, not listed",   Icon: EyeOff   },
                ] as const
              ).map(({ value, label, hint, Icon }) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition-colors",
                    visibility === value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={value}
                    checked={visibility === value}
                    onChange={() => setVisibility(value)}
                    className="mt-0.5 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    <span className="flex items-center gap-1 font-medium">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (error.field === "groupName" || error.field === "groupSlug" || !error.field) && (
            <p className="text-sm text-destructive" role="alert">{error.message}</p>
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => { setError(null); setStep(0); }}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
              {isPending ? "Creating…" : "Create community"}
              {!isPending && <CheckCircle2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
