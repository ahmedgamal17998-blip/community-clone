"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Edit3, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createBookingOfferingAction,
  updateBookingOfferingAction,
  deleteBookingOfferingAction,
  updateBookingButtonSettingsAction,
} from "@/server/actions/booking-offerings";
import { cn } from "@/lib/utils";

type Offering = {
  id: string;
  label: string;
  tooltipText: string | null;
  instructorSlug: string;
  eventSlug: string;
  tier: string;
  visibility: string;
  archived: boolean;
};

type Props = {
  groupId: string;
  groupSlug: string;
  settings: {
    enabled: boolean;
    label: string;
    tooltip: string | null;
  };
  offerings: Offering[];
};

export function BookingAdminClient({
  groupId,
  settings,
  offerings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Button settings ── */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Booking button</h2>
          <p className="text-xs text-muted-foreground">
            When enabled, a button appears in the Events tab header that takes
            members to a page with the Booky embed for any offering they have
            access to.
          </p>
        </div>

        <ButtonSettingsForm
          groupId={groupId}
          initial={settings}
          onSaved={() => router.refresh()}
        />
      </section>

      {/* ── Offerings ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Offerings{" "}
            {offerings.length > 0 && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({offerings.length})
              </span>
            )}
          </h2>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="me-1 h-4 w-4" />
            New offering
          </Button>
        </div>

        {showCreate && (
          <CreateOfferingForm
            groupId={groupId}
            onCancel={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              router.refresh();
            }}
          />
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {offerings.length === 0 && !showCreate ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No offerings yet. Add the Booky event types you want members to
            book.
          </div>
        ) : (
          <ul className="space-y-2">
            {offerings.map((o) => (
              <li key={o.id}>
                {editingId === o.id ? (
                  <EditOfferingRow
                    groupId={groupId}
                    offering={o}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null);
                      router.refresh();
                    }}
                  />
                ) : (
                  <OfferingRow
                    offering={o}
                    isPending={isPending}
                    onEdit={() => setEditingId(o.id)}
                    onDelete={() => {
                      if (
                        confirm(
                          `Delete the "${o.label}" offering? Members on plans linked to it will lose access.`,
                        )
                      ) {
                        run(() =>
                          deleteBookingOfferingAction({
                            groupId,
                            offeringId: o.id,
                          }),
                        );
                      }
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ButtonSettingsForm({
  groupId,
  initial,
  onSaved,
}: {
  groupId: string;
  initial: { enabled: boolean; label: string; tooltip: string | null };
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [label, setLabel] = useState(initial.label);
  const [tooltip, setTooltip] = useState(initial.tooltip ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    enabled !== initial.enabled ||
    label.trim() !== initial.label ||
    (tooltip || "") !== (initial.tooltip ?? "");

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateBookingButtonSettingsAction({
        groupId,
        bookingButtonEnabled: enabled,
        bookingButtonLabel: label.trim(),
        bookingButtonTooltip: tooltip.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    });
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent/40">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Show button on Events tab</div>
          <div className="text-xs text-muted-foreground">
            Off by default until you've added at least one offering.
          </div>
        </div>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="bk-label" className="text-xs">
            Button label
          </Label>
          <Input
            id="bk-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Book a session"
            maxLength={40}
          />
        </div>
        <div>
          <Label htmlFor="bk-tooltip" className="text-xs">
            Info tooltip (optional)
          </Label>
          <Input
            id="bk-tooltip"
            value={tooltip}
            onChange={(e) => setTooltip(e.target.value)}
            placeholder="What members see when they hover the ⓘ icon"
            maxLength={300}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={save}
          disabled={pending || !dirty || !label.trim()}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        {saved && (
          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
            Saved ✓
          </span>
        )}
      </div>
    </div>
  );
}

function CreateOfferingForm({
  groupId,
  onCancel,
  onCreated,
}: {
  groupId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState("");
  const [tooltipText, setTooltipText] = useState("");
  const [instructorSlug, setInstructorSlug] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [tier, setTier] = useState<"FREE" | "PREMIUM">("FREE");
  const [visibility, setVisibility] = useState<"LOCKED_VISIBLE" | "HIDDEN">(
    "LOCKED_VISIBLE",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold">New offering</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Display label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. 30-min mentorship"
          />
        </div>
        <div>
          <Label className="text-xs">Tooltip (optional)</Label>
          <Input
            value={tooltipText}
            onChange={(e) => setTooltipText(e.target.value)}
            placeholder="What members see on hover"
            maxLength={300}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Booky instructor slug</Label>
          <Input
            value={instructorSlug}
            onChange={(e) => setInstructorSlug(e.target.value.trim().toLowerCase())}
            placeholder="ahmed-gamal"
          />
        </div>
        <div>
          <Label className="text-xs">Booky event slug</Label>
          <Input
            value={eventSlug}
            onChange={(e) => setEventSlug(e.target.value.trim().toLowerCase())}
            placeholder="free-30-min"
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Find both slugs in Booky&apos;s event-type URL:{" "}
        <code className="rounded bg-muted px-1">
          /en/embed/<strong>instructor-slug</strong>/<strong>event-slug</strong>
        </code>
      </p>

      <fieldset className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
        <legend className="px-1 text-xs font-medium">Access</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <PickButton
            checked={tier === "FREE"}
            onClick={() => setTier("FREE")}
            title="Free"
            sub="Open to every active member."
          />
          <PickButton
            checked={tier === "PREMIUM"}
            onClick={() => setTier("PREMIUM")}
            title="Premium"
            sub="Locked behind a plan. Subscribers book without paying again."
          />
        </div>
        {tier === "PREMIUM" && (
          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
            <PickButton
              checked={visibility === "LOCKED_VISIBLE"}
              onClick={() => setVisibility("LOCKED_VISIBLE")}
              title="Show locked"
              sub="Members see it dimmed; click opens the paywall."
              compact
            />
            <PickButton
              checked={visibility === "HIDDEN"}
              onClick={() => setVisibility("HIDDEN")}
              title="Hidden"
              sub="Invisible until the member is on a plan that unlocks it."
              compact
            />
          </div>
        )}
      </fieldset>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={
            pending ||
            !label.trim() ||
            !instructorSlug.trim() ||
            !eventSlug.trim()
          }
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await createBookingOfferingAction({
                groupId,
                label: label.trim(),
                tooltipText: tooltipText.trim() || undefined,
                instructorSlug: instructorSlug.trim(),
                eventSlug: eventSlug.trim(),
                tier,
                visibility,
              });
              if (r && "ok" in r && !r.ok) {
                setError(r.error ?? "Failed to create");
                return;
              }
              onCreated();
            });
          }}
        >
          {pending ? "Saving…" : "Create offering"}
        </Button>
      </div>
    </div>
  );
}

function OfferingRow({
  offering,
  isPending,
  onEdit,
  onDelete,
}: {
  offering: Offering;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-3",
        offering.archived && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{offering.label}</span>
          <TierBadge tier={offering.tier} />
          {offering.tier === "PREMIUM" && offering.visibility === "HIDDEN" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              HIDDEN
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          /{offering.instructorSlug}/{offering.eventSlug}
          {offering.tooltipText ? ` · ${offering.tooltipText}` : ""}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onEdit} disabled={isPending}>
        <Edit3 className="me-1 h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onDelete}
        disabled={isPending}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function EditOfferingRow({
  groupId,
  offering,
  onCancel,
  onSaved,
}: {
  groupId: string;
  offering: Offering;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(offering.label);
  const [tooltipText, setTooltipText] = useState(offering.tooltipText ?? "");
  const [instructorSlug, setInstructorSlug] = useState(offering.instructorSlug);
  const [eventSlug, setEventSlug] = useState(offering.eventSlug);
  const [tier, setTier] = useState<"FREE" | "PREMIUM">(
    offering.tier === "PREMIUM" ? "PREMIUM" : "FREE",
  );
  const [visibility, setVisibility] = useState<"LOCKED_VISIBLE" | "HIDDEN">(
    offering.visibility === "HIDDEN" ? "HIDDEN" : "LOCKED_VISIBLE",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
        <Input
          value={tooltipText}
          onChange={(e) => setTooltipText(e.target.value)}
          placeholder="Tooltip (optional)"
          maxLength={300}
        />
        <Input
          value={instructorSlug}
          onChange={(e) => setInstructorSlug(e.target.value.trim().toLowerCase())}
          placeholder="instructor-slug"
        />
        <Input
          value={eventSlug}
          onChange={(e) => setEventSlug(e.target.value.trim().toLowerCase())}
          placeholder="event-slug"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PickButton
          checked={tier === "FREE"}
          onClick={() => setTier("FREE")}
          title="Free"
          sub="Open to all"
          compact
        />
        <PickButton
          checked={tier === "PREMIUM"}
          onClick={() => setTier("PREMIUM")}
          title="Premium"
          sub="Plan-gated"
          compact
        />
      </div>
      {tier === "PREMIUM" && (
        <div className="grid grid-cols-2 gap-2">
          <PickButton
            checked={visibility === "LOCKED_VISIBLE"}
            onClick={() => setVisibility("LOCKED_VISIBLE")}
            title="Show locked"
            sub="Dimmed for non-members"
            compact
          />
          <PickButton
            checked={visibility === "HIDDEN"}
            onClick={() => setVisibility("HIDDEN")}
            title="Hidden"
            sub="Invisible to non-members"
            compact
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>
          <X className="me-1 h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={
            pending ||
            !label.trim() ||
            !instructorSlug.trim() ||
            !eventSlug.trim()
          }
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await updateBookingOfferingAction({
                offeringId: offering.id,
                groupId,
                label: label.trim(),
                tooltipText: tooltipText.trim() || null,
                instructorSlug: instructorSlug.trim(),
                eventSlug: eventSlug.trim(),
                tier,
                visibility,
              });
              if (r && "ok" in r && !r.ok) {
                setError(r.error ?? "Failed to save");
                return;
              }
              onSaved();
            });
          }}
        >
          <Save className="me-1 h-3.5 w-3.5" />
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function PickButton({
  checked,
  onClick,
  title,
  sub,
  compact,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-md border text-start transition-colors",
        compact ? "p-2 text-xs" : "p-3 text-sm",
        checked
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full border-2",
            checked ? "border-primary bg-primary" : "border-border",
          )}
        />
        {title}
      </span>
      <span className="text-[11px] text-muted-foreground">{sub}</span>
    </button>
  );
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === "PREMIUM") {
    return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
        PREMIUM
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      FREE
    </span>
  );
}
