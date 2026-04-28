"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { RenewSubscriptionDialog } from "./RenewSubscriptionDialog";

/**
 * Wraps any UI block that should appear "dimmed/locked" when the user has no
 * access. Click anywhere in the overlay opens the renew dialog.
 *
 * Usage:
 *   <LockedOverlay locked={!hasAccess} groupSlug={slug}>
 *     <ChannelLink ... />
 *   </LockedOverlay>
 */
export function LockedOverlay({
  locked,
  groupSlug,
  reason,
  children,
}: {
  locked: boolean;
  groupSlug: string;
  reason?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!locked) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative block w-full text-left opacity-50 grayscale transition hover:opacity-70 cursor-pointer"
        aria-label={reason ?? "Locked — click to subscribe"}
      >
        <div className="pointer-events-none">{children}</div>
        <div className="absolute inset-0 flex items-center justify-end pr-3">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>
      {open && (
        <RenewSubscriptionDialog
          groupSlug={groupSlug}
          onClose={() => setOpen(false)}
          reason={reason}
        />
      )}
    </>
  );
}
