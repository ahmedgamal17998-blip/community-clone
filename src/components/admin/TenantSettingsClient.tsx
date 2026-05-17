"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, AlertCircle, CheckCircle2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateTenantAction } from "@/server/tenant";

interface TenantData {
  id: string;
  name: string;
  slug: string;
  billingEmail: string;
  customDomain: string;
  plan: string;
}

export function TenantSettingsClient({ tenant }: { tenant: TenantData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(tenant.name);
  const [billingEmail, setBillingEmail] = useState(tenant.billingEmail);
  const [customDomain, setCustomDomain] = useState(tenant.customDomain);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = tenant.plan !== "STARTER";

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateTenantAction({
        tenantId:     tenant.id,
        name:         name || undefined,
        billingEmail: billingEmail || undefined,
        customDomain: isPro ? (customDomain || null) : undefined,
      });
      if (!result.ok) { setError(result.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* General */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">General</h2>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Workspace name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Workspace URL (read-only)</label>
          <div className="flex items-center rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            nadi.app/{tenant.slug}
          </div>
          <p className="text-xs text-muted-foreground">Workspace slug cannot be changed after creation.</p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Billing email</label>
          <input
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder="billing@example.com"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </section>

      {/* Custom domain */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Custom domain</h2>
          {!isPro && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              Pro+
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">Domain</label>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="academy.example.com"
              disabled={!isPro}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
          {isPro ? (
            <p className="text-xs text-muted-foreground">
              Point a CNAME record from your domain to <code className="font-mono">cname.nadi.app</code>,
              then enter the domain here. Changes take up to 24h to propagate.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Upgrade to Pro or Business to use a custom domain.
            </p>
          )}
        </div>
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
        {error && (
          <span className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </span>
        )}
      </div>
    </div>
  );
}
