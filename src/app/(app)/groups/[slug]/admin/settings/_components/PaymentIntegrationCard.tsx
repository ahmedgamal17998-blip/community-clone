"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type Health = {
  paymentSystemUrl: string | null;
  hasAdminKey: boolean;
  hasWebhookSecret: boolean;
  webhookEndpoint: string;
  recentEventCount: number;
  lastEventAt: string | null;
};

export function PaymentIntegrationCard({ initial }: { initial: Health }) {
  const [pending, startTransition] = useTransition();
  const [pingResult, setPingResult] = useState<string | null>(null);

  const ready =
    !!initial.paymentSystemUrl && initial.hasAdminKey;

  const ping = () => {
    setPingResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/payments/health", { cache: "no-store" });
        const data = (await res.json()) as {
          ok: boolean;
          status?: number;
          error?: string;
        };
        if (data.ok) {
          setPingResult("✓ Payment system reachable");
        } else {
          setPingResult(
            `✗ Connection failed: ${data.error ?? `HTTP ${data.status}`}`,
          );
        }
      } catch (e) {
        setPingResult(`✗ ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Configuration status */}
      <div className="grid gap-3 md:grid-cols-2">
        <StatusRow
          label="Payment System URL"
          value={initial.paymentSystemUrl ?? "Not set"}
          ok={!!initial.paymentSystemUrl}
        />
        <StatusRow
          label="Admin API key"
          value={initial.hasAdminKey ? "Configured" : "Not set"}
          ok={initial.hasAdminKey}
        />
        <StatusRow
          label="Webhook signature secret"
          value={
            initial.hasWebhookSecret
              ? "Enforced (HMAC-SHA256)"
              : "Optional (Phase 1: webhooks accepted unsigned)"
          }
          ok={initial.hasWebhookSecret}
          warning={!initial.hasWebhookSecret}
        />
        <StatusRow
          label="Recent webhook events"
          value={
            initial.recentEventCount > 0
              ? `${initial.recentEventCount} in the last 30 days · last ${
                  initial.lastEventAt
                    ? new Date(initial.lastEventAt).toLocaleString()
                    : "—"
                }`
              : "None received yet"
          }
          ok={initial.recentEventCount > 0}
        />
      </div>

      {/* Webhook endpoint */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Webhook endpoint to register on the payment system
        </p>
        <code className="block break-all rounded bg-background px-3 py-2 text-xs">
          {initial.webhookEndpoint}
        </code>
        <p className="mt-2 text-[11px] text-muted-foreground">
          On the Subscription-base admin → Webhooks tab, add this URL and
          subscribe to events:{" "}
          <code className="text-foreground">payment_success</code>,{" "}
          <code className="text-foreground">renewal_success</code>,{" "}
          <code className="text-foreground">payment_failed</code>,{" "}
          <code className="text-foreground">cancel_requested</code>,{" "}
          <code className="text-foreground">cancelled</code>,{" "}
          <code className="text-foreground">expired</code>.
        </p>
      </div>

      {/* Connection test */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={ping}
          disabled={!ready || pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          title={ready ? "" : "Set PAYMENT_SYSTEM_URL and PAYMENT_SYSTEM_ADMIN_KEY env vars first"}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Test connection
        </button>
        {pingResult && (
          <span
            className={`text-xs font-semibold ${
              pingResult.startsWith("✓")
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {pingResult}
          </span>
        )}
      </div>

      {/* Env-var setup helper */}
      {!ready && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <p className="mb-1 font-semibold">Setup needed:</p>
          <p>
            Set these env vars in your hosting platform (Vercel → Project
            Settings → Environment Variables):
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {!initial.paymentSystemUrl && (
              <li>
                <code className="font-mono">PAYMENT_SYSTEM_URL</code> — e.g.{" "}
                <code>https://p.englishsuperfast.com</code>
              </li>
            )}
            {!initial.hasAdminKey && (
              <li>
                <code className="font-mono">PAYMENT_SYSTEM_ADMIN_KEY</code> —
                from your payment-system admin panel → API Keys
              </li>
            )}
            {!initial.hasWebhookSecret && (
              <li>
                <code className="font-mono">PAYMENT_WEBHOOK_SECRET</code>{" "}
                (recommended) — same secret you set on the payment-system side
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
  warning,
}: {
  label: string;
  value: string;
  ok: boolean;
  warning?: boolean;
}) {
  const Icon = ok ? CheckCircle2 : AlertCircle;
  const color = ok
    ? "text-green-600 dark:text-green-400"
    : warning
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-start gap-2 text-sm">
        <Icon className={`h-4 w-4 shrink-0 ${color}`} />
        <span className="break-all">{value}</span>
      </div>
    </div>
  );
}
