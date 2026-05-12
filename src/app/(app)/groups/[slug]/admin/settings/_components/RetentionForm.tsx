"use client";

import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { setRetentionDaysAction } from "../actions";

const inputBase =
  "w-28 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-40";

export function RetentionForm({
  groupId,
  initial,
}: {
  groupId: string;
  initial: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial !== null);
  const [days, setDays] = useState<number>(initial ?? 180);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await setRetentionDaysAction({
        groupId,
        days: enabled ? days : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <label className="flex cursor-pointer items-center gap-3">
        <div
          onClick={() => setEnabled((v) => !v)}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </div>
        <span className="text-sm font-medium">
          {enabled ? "Auto-cleanup enabled" : "Auto-cleanup disabled"}
        </span>
      </label>

      {/* Days input — only visible when enabled */}
      {enabled && (
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              Delete content older than (days)
            </span>
            <input
              type="number"
              min={7}
              max={3650}
              value={days}
              onChange={(e) => setDays(Math.max(7, Number(e.target.value)))}
              className={inputBase}
            />
          </label>
        </div>
      )}

      {/* Warning when enabled */}
      {enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
          <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Posts, comments, and channel chat messages older than{" "}
            <strong>{days} days</strong> will be permanently deleted every
            night. Pinned posts are never deleted.
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
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
