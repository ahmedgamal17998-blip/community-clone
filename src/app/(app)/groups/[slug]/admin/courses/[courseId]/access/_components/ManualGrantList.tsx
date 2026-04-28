"use client";

import { useState, useTransition } from "react";
import {
  manualGrantAction,
  manualRevokeAction,
} from "@/server/actions/course-access";

export function ManualGrantList({
  groupId,
  courseId,
  grants,
  members,
}: {
  groupId: string;
  courseId: string;
  grants: { userId: string; name: string | null; handle: string }[];
  members: { id: string; name: string | null; handle: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState("");

  const grant = () => {
    if (!userId) return;
    startTransition(async () => {
      await manualGrantAction({ groupId, courseId, userId });
      setUserId("");
    });
  };

  const revoke = (id: string) => {
    startTransition(async () => {
      await manualRevokeAction({ groupId, courseId, userId: id });
    });
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">Manual grants</h2>
      <p className="text-xs text-muted-foreground">
        Specific members granted access regardless of rules.
      </p>

      <div className="flex items-center gap-2">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Pick a member…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.handle} (@{m.handle})
            </option>
          ))}
        </select>
        <button
          onClick={grant}
          disabled={pending || !userId}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Grant
        </button>
      </div>

      {grants.length > 0 && (
        <ul className="space-y-1">
          {grants.map((g) => (
            <li
              key={g.userId}
              className="flex items-center justify-between rounded-md bg-muted/40 p-2 text-sm"
            >
              <span>
                {g.name ?? g.handle}{" "}
                <span className="text-xs text-muted-foreground">@{g.handle}</span>
              </span>
              <button
                onClick={() => revoke(g.userId)}
                disabled={pending}
                className="text-xs text-destructive hover:underline"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
