"use client";

import { useState, useTransition } from "react";
import { saveOnboardingAction } from "@/server/actions/onboarding";
import { Plus, Trash2 } from "lucide-react";

type Step = { target: string; title: string; body: string; order: number };

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
      : [{ target: "", title: "Welcome!", body: "Let me show you around.", order: 0 }],
  );
  const [saved, setSaved] = useState(false);

  const update = (i: number, patch: Partial<Step>) => {
    setSteps((p) => p.map((s, j) => (i === j ? { ...s, ...patch } : s)));
  };

  const add = () =>
    setSteps((p) => [
      ...p,
      { target: "", title: "New step", body: "", order: p.length },
    ]);

  const remove = (i: number) =>
    setSteps((p) => p.filter((_, j) => j !== i).map((s, j) => ({ ...s, order: j })));

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
          <div key={i} className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step {i + 1}
              </div>
              <button
                onClick={() => remove(i)}
                className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Target selector (e.g. [data-tour=feed])"
              value={s.target}
              onChange={(e) => update(i, { target: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Title"
              value={s.title}
              onChange={(e) => update(i, { title: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Body"
              value={s.body}
              onChange={(e) => update(i, { body: e.target.value })}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
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
