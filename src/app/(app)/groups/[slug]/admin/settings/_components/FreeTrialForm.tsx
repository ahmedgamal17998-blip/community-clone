"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setFreeTrialDaysAction } from "../actions";

const inputBase =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function FreeTrialForm({
  groupId,
  initial,
}: {
  groupId: string;
  initial: number;
}) {
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState<number>(initial);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await setFreeTrialDaysAction({ groupId, days });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-[160px]">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">
          Trial length (days)
        </span>
        <input
          type="number"
          min={0}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={inputBase}
        />
      </label>
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
  );
}
