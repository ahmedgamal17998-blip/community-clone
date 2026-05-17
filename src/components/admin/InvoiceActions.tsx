"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InvoiceActions({
  invoiceId,
  currentStatus,
}: {
  invoiceId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmVoid, setConfirmVoid] = useState(false);

  async function doAction(action: "markPaid" | "markVoid") {
    setConfirmVoid(false);
    startTransition(async () => {
      await fetch("/api/super-admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, invoiceId }),
      });
      router.refresh();
    });
  }

  if (currentStatus === "PAID" || currentStatus === "VOID") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (confirmVoid) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-destructive">Void invoice?</span>
        <Button size="sm" variant="destructive" onClick={() => doAction("markVoid")} disabled={isPending} className="h-6 px-2 text-xs">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmVoid(false)} disabled={isPending} className="h-6 px-2 text-xs">
          No
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        onClick={() => doAction("markPaid")}
        disabled={isPending}
        className="h-6 gap-1 px-2 text-xs bg-green-600 hover:bg-green-700"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Paid
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirmVoid(true)}
        disabled={isPending}
        className="h-6 gap-1 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
      >
        <Ban className="h-3 w-3" />
        Void
      </Button>
    </div>
  );
}
