"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Target = "ALL" | "PLAN" | "SPECIFIC";

const PLANS = ["STARTER", "PRO", "BUSINESS"] as const;

export function SendNotificationForm({
  tenants,
}: {
  tenants: { id: string; name: string; plan: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [target,   setTarget]   = useState<Target>("ALL");
  const [plan,     setPlan]     = useState("PRO");
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [message,  setMessage]  = useState("");
  const [result,   setResult]   = useState<{ count: number } | null>(null);
  const [error,    setError]    = useState("");

  const charLimit = 300;

  function handleSend() {
    if (!message.trim()) { setError("Message is required."); return; }
    setError("");
    setResult(null);

    startTransition(async () => {
      const res = await fetch("/api/super-admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, plan, tenantId, message }),
      });
      const data = await res.json() as { ok?: boolean; count?: number; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult({ count: data.count ?? 0 });
        setMessage("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold">Compose notification</h2>

      {/* Target selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Send to</label>
        <div className="flex flex-wrap gap-2">
          {(["ALL", "PLAN", "SPECIFIC"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTarget(t)}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                target === t
                  ? "bg-primary text-primary-foreground"
                  : "border border-border hover:bg-muted"
              }`}
            >
              {t === "ALL"      ? "All owners" :
               t === "PLAN"     ? "By plan" :
               "Specific owner"}
            </button>
          ))}
        </div>
      </div>

      {/* Plan picker */}
      {target === "PLAN" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Plan</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {/* Specific tenant picker */}
      {target === "SPECIFIC" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Workspace</label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>
            ))}
          </select>
        </div>
      )}

      {/* Message */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Message</label>
          <span className={`text-[10px] ${message.length > charLimit - 20 ? "text-destructive" : "text-muted-foreground"}`}>
            {message.length}/{charLimit}
          </span>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, charLimit))}
          rows={4}
          placeholder="Write your notification message here…"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary resize-none"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {result && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Notification sent to <strong>{result.count}</strong> owner{result.count !== 1 ? "s" : ""}.
        </div>
      )}

      <Button
        onClick={handleSend}
        disabled={isPending || !message.trim()}
        className="gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send notification
      </Button>
    </div>
  );
}
