"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Save, ChevronDown, ChevronUp, Clock } from "lucide-react";
import {
  saveContentRetentionAction,
  saveActiveGatewayAction,
  saveStripeAction,
  saveSubBaseAction,
} from "@/server/platform-settings";

// ─── Types ────────────────────────────────────────────────────────────────────

type GatewayMode = "NONE" | "STRIPE" | "SUBSCRIPTION_BASE" | "BOTH";

interface Props {
  retentionDays:       number;
  activeGateway:       GatewayMode;
  stripeConfigured:    boolean;
  stripePublishableKey: string;
  subBaseConfigured:   boolean;
  subBaseUrl:          string;
}

// ─── Small reusable: save-row with status ─────────────────────────────────────

function SaveStatus({ ok, error }: { ok: boolean | null; error?: string }) {
  if (ok === null) return null;
  if (ok) return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>;
  return <span className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" /> {error}</span>;
}

// ─── Collapsible credential form ─────────────────────────────────────────────

function CredentialSection({ title, open, onToggle, children }: {
  title: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <button type="button" onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors">
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border px-4 py-4">{children}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SuperAdminSettingsClient({
  retentionDays: initialRetention,
  activeGateway:  initialGateway,
  stripeConfigured,
  stripePublishableKey: initPk,
  subBaseConfigured,
  subBaseUrl: initSubUrl,
}: Props) {

  // ── Retention ──────────────────────────────────────────────────────────────
  const [retention, setRetention]     = useState(initialRetention);
  const [retentionPending, startRT]   = useTransition();
  const [retentionStatus, setRS]      = useState<null | { ok: boolean; error?: string }>(null);

  const saveRetention = () => {
    startRT(async () => {
      const r = await saveContentRetentionAction(retention);
      setRS(r.ok ? { ok: true } : { ok: false, error: r.error });
    });
  };

  // ── Gateway selection ──────────────────────────────────────────────────────
  const [gateway, setGateway]         = useState<GatewayMode>(initialGateway);
  const [gatewayPending, startGW]     = useTransition();
  const [gatewayStatus, setGS]        = useState<null | { ok: boolean; error?: string }>(null);

  const saveGateway = (gw: GatewayMode) => {
    setGateway(gw);
    startGW(async () => {
      const r = await saveActiveGatewayAction(gw);
      setGS(r.ok ? { ok: true } : { ok: false, error: r.error });
    });
  };

  // ── Stripe credentials ─────────────────────────────────────────────────────
  const [stripeOpen, setStripeOpen]   = useState(false);
  const [stripePk, setStripePk]       = useState(initPk);
  const [stripeSk, setStripeSk]       = useState("");
  const [stripeWh, setStripeWh]       = useState("");
  const [stripePending, startST]      = useTransition();
  const [stripeStatus, setSTS]        = useState<null | { ok: boolean; error?: string }>(null);

  const saveStripe = () => {
    startST(async () => {
      const r = await saveStripeAction({ secretKey: stripeSk, publishableKey: stripePk, webhookSecret: stripeWh });
      setSTS(r.ok ? { ok: true } : { ok: false, error: r.error });
      if (r.ok) { setStripeSk(""); setStripeWh(""); }
    });
  };

  // ── Subscription-base credentials ──────────────────────────────────────────
  const [sbOpen, setSbOpen]           = useState(false);
  const [sbUrl, setSbUrl]             = useState(initSubUrl);
  const [sbKey, setSbKey]             = useState("");
  const [sbPending, startSB]          = useTransition();
  const [sbStatus, setSBS]            = useState<null | { ok: boolean; error?: string }>(null);

  const saveSubBase = () => {
    startSB(async () => {
      const r = await saveSubBaseAction({ baseUrl: sbUrl, adminApiKey: sbKey });
      setSBS(r.ok ? { ok: true } : { ok: false, error: r.error });
      if (r.ok) setSbKey("");
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── 1. Content retention ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> Content retention
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Posts and channel chat messages older than this limit are auto-deleted daily.
            Groups can override this individually. Set to 0 to disable for a group.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={3650} value={retention}
              onChange={(e) => setRetention(parseInt(e.target.value, 10) || 90)}
              className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          <button onClick={saveRetention} disabled={retentionPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Save className="h-3 w-3" /> {retentionPending ? "Saving…" : "Save"}
          </button>
          {retentionStatus && <SaveStatus ok={retentionStatus.ok} error={retentionStatus.error} />}
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-400">
          ⚠️ <strong>Applies to all groups</strong> — this default affects every group that hasn&apos;t set its own retention days (including existing ones). Groups can opt out by setting &quot;0 days&quot; in their own Admin → Settings.
          Current default: <strong>{retention} days</strong>. Pinned posts and pinned messages are never auto-deleted.
        </div>
      </section>

      {/* ── 2. Platform billing gateway ──────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Platform billing gateway</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Controls how workspace owners pay for their Nadi plan. Choose one active gateway.
          </p>
        </div>

        {/* Active gateway selector — supports BOTH for multi-gateway checkout */}
        <div className="flex flex-wrap gap-3">
          {([
            { val: "NONE",              label: "No gateway",              desc: "Billing disabled" },
            { val: "STRIPE",            label: "Stripe only",             desc: "International cards" },
            { val: "SUBSCRIPTION_BASE", label: "Subscription-base only",  desc: "Paymob / EGP" },
            { val: "BOTH",              label: "Both gateways",           desc: "Customer chooses at checkout" },
          ] as const).map(({ val, label, desc }) => (
            <label key={val} className={`flex cursor-pointer flex-col rounded-xl border px-4 py-2.5 text-sm transition-colors select-none ${
              gateway === val ? "border-primary bg-primary/5 font-semibold" : "border-border bg-card hover:bg-muted/40"
            }`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="gateway" value={val} checked={gateway === val}
                  onChange={() => saveGateway(val)} disabled={gatewayPending}
                  className="accent-primary" />
                {label}
              </span>
              <span className="mt-0.5 ms-5 text-[10px] font-normal text-muted-foreground">{desc}</span>
            </label>
          ))}
          {gatewayStatus && <SaveStatus ok={gatewayStatus.ok} error={gatewayStatus.error} />}
        </div>
        {gateway === "BOTH" && (
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            💡 <strong>Both gateways active:</strong> customers see a payment method selector at checkout — Stripe for international cards, Subscription-base (Paymob) for EGP payments. Make sure both are configured below.
          </p>
        )}

        {/* Stripe credentials */}
        <CredentialSection
          title={
            <span className="flex items-center gap-2">
              Stripe credentials
              {stripeConfigured
                ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Configured</span>
                : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Not configured</span>}
            </span>
          }
          open={stripeOpen} onToggle={() => setStripeOpen((v) => !v)}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Secret key (sk_…)</label>
                <input type="password" placeholder={stripeConfigured ? "••••••••• (leave blank to keep)" : "sk_live_…"}
                  value={stripeSk} onChange={(e) => setStripeSk(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Publishable key (pk_…)</label>
                <input type="text" placeholder="pk_live_…"
                  value={stripePk} onChange={(e) => setStripePk(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Webhook secret (whsec_…)</label>
                <input type="password" placeholder={stripeConfigured ? "••••••••• (leave blank to keep)" : "whsec_…"}
                  value={stripeWh} onChange={(e) => setStripeWh(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveStripe} disabled={stripePending || (!stripeSk && !stripeConfigured)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Save className="h-3 w-3" /> {stripePending ? "Saving…" : "Save Stripe credentials"}
              </button>
              {stripeStatus && <SaveStatus ok={stripeStatus.ok} error={stripeStatus.error} />}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Credentials are encrypted with AES-256-GCM before storage. Secret keys are never returned to the browser.
            </p>
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="font-mono text-[11px] text-muted-foreground">
                Webhook URL: <span className="text-foreground">/api/webhooks/payment?provider=stripe</span>
              </p>
            </div>
          </div>
        </CredentialSection>

        {/* Subscription-base credentials */}
        <CredentialSection
          title={
            <span className="flex items-center gap-2">
              Subscription-base credentials
              {subBaseConfigured
                ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Configured</span>
                : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Not configured</span>}
            </span>
          }
          open={sbOpen} onToggle={() => setSbOpen((v) => !v)}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Base URL</label>
                <input type="url" placeholder="https://p.yourdomain.com"
                  value={sbUrl} onChange={(e) => setSbUrl(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Admin API key</label>
                <input type="password" placeholder={subBaseConfigured ? "••••••••• (leave blank to keep)" : "API key…"}
                  value={sbKey} onChange={(e) => setSbKey(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveSubBase} disabled={sbPending || (!sbKey && !subBaseConfigured)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Save className="h-3 w-3" /> {sbPending ? "Saving…" : "Save Subscription-base credentials"}
              </button>
              {sbStatus && <SaveStatus ok={sbStatus.ok} error={sbStatus.error} />}
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="font-mono text-[11px] text-muted-foreground">
                Webhook URL: <span className="text-foreground">/api/webhooks/payment?provider=subscription-base</span>
              </p>
            </div>
          </div>
        </CredentialSection>
      </section>

      {/* ── 3. Email provider (coming soon) ──────────────────────────────── */}
      <section className="space-y-3 opacity-50 pointer-events-none select-none">
        <h2 className="text-base font-semibold">Email provider</h2>
        <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          Configure SMTP / Resend for transactional emails — coming soon.
        </div>
      </section>
    </div>
  );
}
