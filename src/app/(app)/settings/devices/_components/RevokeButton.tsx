"use client";

import { useTransition } from "react";
import { revokeSessionAction } from "../actions";

export function RevokeButton({ sessionId }: { sessionId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await revokeSessionAction({ sessionId });
        })
      }
      disabled={pending}
      className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
    >
      {pending ? "…" : "Revoke"}
    </button>
  );
}
