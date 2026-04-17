"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBookingAction } from "@/server/booking-actions";
import { Button } from "@/components/ui/button";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">Cancel this booking?</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        rows={3}
        className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
        >
          Keep booking
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("bookingId", bookingId);
            if (reason) fd.set("reason", reason);
            startTransition(async () => {
              const res = await cancelBookingAction(fd);
              if (res?.ok) {
                router.refresh();
                setOpen(false);
              } else {
                setError(res?.error ?? "Failed to cancel");
              }
            });
          }}
        >
          {pending ? "Cancelling…" : "Confirm cancel"}
        </Button>
      </div>
    </div>
  );
}
