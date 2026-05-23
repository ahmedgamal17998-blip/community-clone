"use client";

import { useState, useTransition } from "react";
import { saveOnboardingAction } from "@/server/actions/onboarding";
import {
  Plus,
  Trash2,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Hash,
  Megaphone,
  Lock,
  FileText,
  MessageSquare,
  Bookmark,
  Bell,
  User,
  X,
} from "lucide-react";
import { TOUR_TARGETS, TOUR_TARGET_BY_ID } from "@/lib/tour-targets";

type Step = { target: string; title: string; body: string; order: number; icon?: string };

const CUSTOM_VALUE = "__custom__";
const CENTER_VALUE = "__center__";

/**
 * Available icons for step cards.
 * Each entry: { id, label, Icon component }
 */
const STEP_ICONS = [
  { id: "hash",         label: "Channel (general)",      Icon: Hash },
  { id: "megaphone",    label: "Channel (announcement)",  Icon: Megaphone },
  { id: "lock",         label: "Channel (private)",       Icon: Lock },
  { id: "file-text",    label: "Posts",                   Icon: FileText },
  { id: "message-sq",  label: "Chat",                    Icon: MessageSquare },
  { id: "bookmark",     label: "Saved",                   Icon: Bookmark },
  { id: "bell",         label: "Notifications",           Icon: Bell },
  { id: "user",         label: "Profile",                 Icon: User },
] as const;

function StepIcon({ id, className }: { id: string; className?: string }) {
  const found = STEP_ICONS.find((ic) => ic.id === id);
  if (!found) return null;
  const { Icon } = found;
  return <Icon className={className} />;
}

/**
 * Translate a stored target value (raw selector) into the dropdown selection.
 * If it matches a known target's selector, return that target's id; if empty,
 * the centered card mode; otherwise the special "custom" sentinel.
 */
function targetToDropdownValue(target: string): string {
  if (!target) return CENTER_VALUE;
  const match = TOUR_TARGETS.find((t) => t.selector === target);
  if (match) return match.id;
  return CUSTOM_VALUE;
}

export function StepsEditor({
  groupId,
  initialEnabled,
  initialSteps,
}: {
  groupId: string;
  initialEnabled: boolean;
  initialSteps: Step[];
}) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [steps, setSteps] = useState<Step[]>(
    initialSteps.length > 0
      ? [...initialSteps].sort((a, b) => a.order - b.order)
      : [
          {
            target: TOUR_TARGET_BY_ID["group-header"]?.selector ?? "",
            title: "Welcome!",
            body: "Let me show you around.",
            order: 0,
          },
        ],
  );
  const [saved, setSaved] = useState(false);

  const update = (i: number, patch: Partial<Step>) => {
    setSteps((p) => p.map((s, j) => (i === j ? { ...s, ...patch } : s)));
  };

  const add = () =>
    setSteps((p) => [
      ...p,
      {
        target: TOUR_TARGET_BY_ID["groups-tabs"]?.selector ?? "",
        title: "New step",
        body: "",
        order: p.length,
      },
    ]);

  const remove = (i: number) =>
    setSteps((p) => p.filter((_, j) => j !== i).map((s, j) => ({ ...s, order: j })));

  /** Move step at index i up one position. */
  const moveUp = (i: number) => {
    if (i === 0) return;
    setSteps((p) => {
      const next = [...p];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next.map((s, j) => ({ ...s, order: j }));
    });
  };

  /** Move step at index i down one position. */
  const moveDown = (i: number) => {
    setSteps((p) => {
      if (i >= p.length - 1) return p;
      const next = [...p];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next.map((s, j) => ({ ...s, order: j }));
    });
  };

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await saveOnboardingAction({
        groupId,
        enabled,
        steps: steps.map((s, i) => ({ ...s, order: i })),
      });
      setSaved(true);
    });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable tour for new members
      </label>

      <div className="space-y-3">
        {steps.map((s, i) => (
          <StepCard
            key={i}
            index={i}
            total={steps.length}
            step={s}
            onChange={(patch) => update(i, patch)}
            onRemove={() => remove(i)}
            onMoveUp={() => moveUp(i)}
            onMoveDown={() => moveDown(i)}
          />
        ))}

        <button
          onClick={add}
          className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Add step
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save tour"}
        </button>
        {saved && <span className="text-xs text-green-600">Saved ✓</span>}
      </div>
    </div>
  );
}

// ─── Step card ─────────────────────────────────────────────────────────────

function StepCard({
  index,
  total,
  step,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  total: number;
  step: Step;
  onChange: (patch: Partial<Step>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const dropdownValue = targetToDropdownValue(step.target);
  const isCustom = dropdownValue === CUSTOM_VALUE;
  const selectedTarget =
    dropdownValue !== CUSTOM_VALUE && dropdownValue !== CENTER_VALUE
      ? TOUR_TARGET_BY_ID[dropdownValue]
      : null;

  const handleDropdown = (value: string) => {
    if (value === CENTER_VALUE) {
      onChange({ target: "" });
    } else if (value === CUSTOM_VALUE) {
      if (!isCustom) onChange({ target: "" });
    } else {
      const t = TOUR_TARGET_BY_ID[value];
      if (t) onChange({ target: t.selector });
    }
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      {/* Header row: step number + reorder arrows + delete */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step {index + 1}
        </div>
        <div className="flex items-center gap-1">
          {/* Move up */}
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="Move step up"
            title="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          {/* Move down */}
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="Move step down"
            title="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          {/* Delete */}
          <button
            onClick={onRemove}
            className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Icon picker */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Icon (optional)
        </label>
        <div className="flex items-center gap-2">
          {/* Preview of selected icon */}
          <button
            type="button"
            onClick={() => setIconPickerOpen((v) => !v)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background text-foreground hover:bg-muted"
            aria-label={step.icon ? "Change icon" : "Pick an icon"}
            title={step.icon ? "Change icon" : "Pick an icon"}
          >
            {step.icon ? (
              <StepIcon id={step.icon} className="h-4 w-4" />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </button>
          <span className="text-xs text-muted-foreground">
            {step.icon
              ? STEP_ICONS.find((ic) => ic.id === step.icon)?.label ?? step.icon
              : "No icon"}
          </span>
          {step.icon && (
            <button
              type="button"
              onClick={() => onChange({ icon: undefined })}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove icon"
              title="Remove icon"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Icon grid */}
        {iconPickerOpen && (
          <div className="grid grid-cols-4 gap-1.5 rounded-md border bg-background p-2">
            {STEP_ICONS.map((ic) => (
              <button
                key={ic.id}
                type="button"
                onClick={() => {
                  onChange({ icon: ic.id });
                  setIconPickerOpen(false);
                }}
                title={ic.label}
                aria-label={ic.label}
                className={`flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent ${
                  step.icon === ic.id ? "bg-primary/10 text-primary ring-1 ring-primary" : "text-muted-foreground"
                }`}
              >
                <ic.Icon className="h-4 w-4" />
                <span className="leading-tight text-center">{ic.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pick what to highlight */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          What does this step point to?
        </label>
        <div className="relative">
          <select
            value={dropdownValue}
            onChange={(e) => handleDropdown(e.target.value)}
            className="w-full appearance-none rounded-md border bg-background px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none"
          >
            <option value={CENTER_VALUE}>
              No specific element — show centered card
            </option>
            <optgroup label="Highlight on the page">
              {TOUR_TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            <option value={CUSTOM_VALUE}>Advanced — custom CSS selector…</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {selectedTarget ? (
          <p className="text-xs text-muted-foreground">{selectedTarget.hint}</p>
        ) : null}
        {isCustom ? (
          <input
            type="text"
            placeholder='e.g. [data-tour="my-thing"]  or  #my-id  or  .my-class'
            value={step.target}
            onChange={(e) => onChange({ target: e.target.value })}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
          />
        ) : null}
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Title</label>
        <input
          type="text"
          placeholder="Welcome!"
          value={step.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Body / message
        </label>
        <textarea
          placeholder="Tell the member what this is and why it matters."
          value={step.body}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
