"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SuperAdminTenantActions({
  tenantId,
  currentPlan,
  currentStatus,
}: {
  tenantId: string;
  currentPlan: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  async function doAction(action: string, extra?: Record<string, string>) {
    setOpen(false);
    startTransition(async () => {
      await fetch("/api/admin/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tenantId, ...extra }),
      });
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="h-7 gap-1 px-2 text-xs"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Actions <ChevronDown className="h-3 w-3" /></>}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-44 rounded-xl border border-border bg-card shadow-lg">
            {["STARTER","PRO","BUSINESS"].filter((p) => p !== currentPlan).map((p) => (
              <button
                key={p}
                onClick={() => doAction("setPlan", { plan: p })}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
              >
                Set plan → {p}
              </button>
            ))}
            {currentStatus !== "SUSPENDED" && (
              <button
                onClick={() => doAction("setSuspended")}
                className="block w-full px-3 py-2 text-left text-xs text-destructive hover:bg-muted transition-colors"
              >
                Suspend workspace
              </button>
            )}
            {currentStatus === "SUSPENDED" && (
              <button
                onClick={() => doAction("setActive")}
                className="block w-full px-3 py-2 text-left text-xs text-green-600 hover:bg-muted transition-colors"
              >
                Restore workspace
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
