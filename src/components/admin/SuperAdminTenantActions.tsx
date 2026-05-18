"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SuperAdminTenantActions({
  tenantId,
  currentPlan,
  currentStatus,
  subscriptionBaseEnabled,
}: {
  tenantId: string;
  currentPlan: string;
  currentStatus: string;
  subscriptionBaseEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  async function doAction(action: string, extra?: Record<string, unknown>) {
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

  const isPaused    = currentStatus === "PAST_DUE";
  const isSuspended = currentStatus === "SUSPENDED";
  const isActive    = currentStatus === "ACTIVE" || currentStatus === "TRIAL";

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}
        disabled={isPending} className="h-7 gap-1 px-2 text-xs">
        {isPending
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <>Actions <ChevronDown className="h-3 w-3" /></>}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-border bg-card shadow-lg overflow-hidden">

            <div className="px-2 py-1.5">
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Change plan</p>
              {["STARTER", "PRO", "BUSINESS"].filter((p) => p !== currentPlan).map((p) => (
                <button key={p} onClick={() => doAction("setPlan", { plan: p })}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors">
                  → {p}
                </button>
              ))}
            </div>

            <div className="border-t border-border" />

            <div className="px-2 py-1.5">
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Workspace status</p>

              {isActive && (
                <button onClick={() => doAction("setPaused")}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-amber-600 hover:bg-muted transition-colors">
                  ⏸ Pause workspace
                  <span className="block text-[10px] font-normal text-muted-foreground">Temporary — auto-resume on payment</span>
                </button>
              )}

              {!isSuspended && (
                <button onClick={() => doAction("setSuspended")}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted transition-colors">
                  🚫 Suspend workspace
                  <span className="block text-[10px] font-normal text-muted-foreground">Permanent until manually lifted</span>
                </button>
              )}

              {(isPaused || isSuspended) && (
                <button onClick={() => doAction("setActive")}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-green-600 hover:bg-muted transition-colors">
                  ▶ Restore workspace
                  <span className="block text-[10px] font-normal text-muted-foreground">Sets status back to ACTIVE</span>
                </button>
              )}
            </div>

            <div className="border-t border-border" />

            <div className="px-2 py-1.5">
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Feature flags</p>
              <button
                onClick={() => doAction("setSubscriptionBase", { enabled: !subscriptionBaseEnabled })}
                className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors ${
                  subscriptionBaseEnabled ? "text-violet-600" : "text-muted-foreground"
                }`}
              >
                {subscriptionBaseEnabled ? "✓ Subscription-base ON" : "○ Subscription-base OFF"}
                <span className="block text-[10px] font-normal text-muted-foreground">Toggle external billing feature</span>
              </button>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
