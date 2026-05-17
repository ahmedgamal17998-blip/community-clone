"use client";

import { useState, useTransition } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveSubscriptionAction, rejectSubscriptionAction } from "@/server/subscriptions";
import { useRouter } from "next/navigation";

export function SubscriptionApprovalButtons({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function handleApprove() {
    startTransition(async () => {
      const result = await approveSubscriptionAction(subscriptionId);
      if (result.ok) router.refresh();
    });
  }

  function handleReject() {
    if (!rejecting) { setRejecting(true); return; }
    if (!rejectReason.trim()) return;
    startTransition(async () => {
      const result = await rejectSubscriptionAction(subscriptionId, rejectReason);
      if (result.ok) { setRejecting(false); router.refresh(); }
    });
  }

  if (rejecting) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Rejection reason..."
          className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          autoFocus
        />
        <Button size="sm" variant="destructive" onClick={handleReject} disabled={isPending || !rejectReason.trim()} className="gap-1">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          Reject
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={handleApprove}
        disabled={isPending}
        className="gap-1.5 bg-green-600 hover:bg-green-700"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleReject}
        disabled={isPending}
        className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
      >
        <X className="h-3 w-3" />
        Reject
      </Button>
    </div>
  );
}
