"use client";

import Link from "next/link";
import { X } from "lucide-react";

/**
 * Modal shown when a member clicks a locked resource. Directs them to the
 * group's subscription page where they can renew/extend.
 */
export function RenewSubscriptionDialog({
  groupSlug,
  onClose,
  reason,
}: {
  groupSlug: string;
  onClose: () => void;
  reason?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Subscription required</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {reason ??
            "Your access to this resource has expired. Subscribe or renew to unlock all permitted content."}
        </p>

        <div className="mt-6 flex gap-2">
          <Link
            href={`/groups/${groupSlug}/me`}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={onClose}
          >
            Subscribe / Renew
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
