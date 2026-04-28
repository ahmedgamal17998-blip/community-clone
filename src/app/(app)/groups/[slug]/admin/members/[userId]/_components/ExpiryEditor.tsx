"use client";

import { useTransition, useState } from "react";
import { setMembershipExpiryAction } from "@/server/actions/access";

export function ExpiryEditor({
  groupId,
  userId,
  accessExpiresAt,
  lockedAt,
}: {
  groupId: string;
  userId: string;
  accessExpiresAt: Date | null;
  lockedAt: Date | null;
}) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(
    accessExpiresAt ? new Date(accessExpiresAt).toISOString().slice(0, 10) : "",
  );
  const [locked, setLocked] = useState(!!lockedAt);

  const save = () => {
    startTransition(async () => {
      await setMembershipExpiryAction({
        groupId,
        userId,
        accessExpiresAt: date ? new Date(date) : null,
        lockedAt: locked ? new Date() : null,
      });
    });
  };

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Access expires at
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={locked}
          onChange={(e) => setLocked(e.target.checked)}
        />
        Lock access
      </label>

      <button
        onClick={save}
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
