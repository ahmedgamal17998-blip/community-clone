"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Star, StarOff, Loader2, Check, X,
  CreditCard, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createPaymentMethodAction,
  updatePaymentMethodAction,
  deletePaymentMethodAction,
  type PaymentMethodType,
  type CreatePaymentMethodInput,
} from "@/server/payment-methods";

interface MethodRow {
  id: string;
  type: string;
  typeLabel: string;
  label: string;
  active: boolean;
  isDefault: boolean;
  createdAt: Date;
}

const MANUAL_TYPES: PaymentMethodType[] = [
  "MANUAL_VODAFONE_CASH",
  "MANUAL_INSTAPAY",
  "MANUAL_BANK_TRANSFER",
  "MANUAL_FAWRY",
  "MANUAL_CUSTOM",
];

const BASE_TYPE_OPTIONS = [
  { value: "MANUAL_VODAFONE_CASH", label: "Vodafone Cash" },
  { value: "MANUAL_INSTAPAY",      label: "InstaPay" },
  { value: "MANUAL_BANK_TRANSFER", label: "Bank Transfer" },
  { value: "MANUAL_FAWRY",         label: "Fawry" },
  { value: "MANUAL_CUSTOM",        label: "Custom Manual" },
  { value: "PAYMOB",               label: "Paymob (Automated)" },
  { value: "STRIPE",               label: "Stripe (Automated)" },
];

export function PaymentMethodsClient({
  tenantId,
  methods: initialMethods,
  subscriptionBaseEnabled = false,
}: {
  tenantId: string;
  methods: MethodRow[];
  subscriptionBaseEnabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add form state
  const [type, setType] = useState<PaymentMethodType>("MANUAL_VODAFONE_CASH");
  const [label, setLabel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [accountDetails, setAccountDetails] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [integrationId, setIntegrationId] = useState("");
  const [hmacSecret, setHmacSecret] = useState("");
  const [iframeId, setIframeId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [subBaseUrl, setSubBaseUrl] = useState("");
  const [subAdminApiKey, setSubAdminApiKey] = useState("");
  const [subWebhookSecret, setSubWebhookSecret] = useState("");

  const isManual = MANUAL_TYPES.includes(type);
  const isPaymob = type === "PAYMOB";
  const isStripe  = type === "STRIPE";
  const isSubscriptionBase = type === "SUBSCRIPTION_BASE";

  const typeOptions = subscriptionBaseEnabled
    ? [...BASE_TYPE_OPTIONS, { value: "SUBSCRIPTION_BASE", label: "Subscription-base (External)" }]
    : BASE_TYPE_OPTIONS;

  function handleAdd() {
    setFormError(null);
    const base = { tenantId, label };

    let input: CreatePaymentMethodInput;
    if (isManual) {
      input = {
        tenantId, label,
        type: type as "MANUAL_VODAFONE_CASH" | "MANUAL_INSTAPAY" | "MANUAL_BANK_TRANSFER" | "MANUAL_FAWRY" | "MANUAL_CUSTOM",
        instructions,
        accountDetails,
      };
    } else if (isPaymob) {
      input = { ...base, type: "PAYMOB", apiKey, integrationId, hmacSecret, iframeId: iframeId || undefined };
    } else if (isSubscriptionBase) {
      input = { ...base, type: "SUBSCRIPTION_BASE", baseUrl: subBaseUrl, adminApiKey: subAdminApiKey, webhookSecret: subWebhookSecret || undefined };
    } else {
      input = { ...base, type: "STRIPE", secretKey, webhookSecret, publishableKey };
    }

    startTransition(async () => {
      const result = await createPaymentMethodAction(input);
      if (!result.ok) { setFormError(result.error); return; }
      setShowForm(false);
      resetForm();
      router.refresh();
    });
  }

  function resetForm() {
    setLabel(""); setInstructions(""); setAccountDetails("");
    setApiKey(""); setIntegrationId(""); setHmacSecret(""); setIframeId("");
    setSecretKey(""); setWebhookSecret(""); setPublishableKey("");
    setSubBaseUrl(""); setSubAdminApiKey(""); setSubWebhookSecret("");
    setFormError(null);
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deletePaymentMethodAction(id, tenantId);
      router.refresh();
    });
  }

  function handleSetDefault(id: string) {
    startTransition(async () => {
      await updatePaymentMethodAction({ id, tenantId, isDefault: true });
      router.refresh();
    });
  }

  function handleToggleActive(id: string, active: boolean) {
    startTransition(async () => {
      await updatePaymentMethodAction({ id, tenantId, active: !active });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Existing methods */}
      {initialMethods.length === 0 && !showForm ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No payment methods yet.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Add one to start accepting payments from members.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {initialMethods.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl border bg-card px-4 py-3",
                m.isDefault ? "border-primary/40" : "border-border",
              )}
            >
              <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{m.label}</p>
                  {m.isDefault && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      Default
                    </span>
                  )}
                  {!m.active && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{m.typeLabel}</p>
              </div>
              <div className="flex items-center gap-1">
                {!m.isDefault && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => handleSetDefault(m.id)}
                    disabled={isPending}
                    title="Set as default"
                    className="h-7 w-7 p-0"
                  >
                    <StarOff className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost" size="sm"
                  onClick={() => handleToggleActive(m.id, m.active)}
                  disabled={isPending}
                  title={m.active ? "Deactivate" : "Activate"}
                  className="h-7 w-7 p-0"
                >
                  {m.active ? <Check className="h-3.5 w-3.5 text-green-600" /> : <X className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => handleDelete(m.id)}
                  disabled={isPending}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold">Add payment method</p>

          {/* Type selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PaymentMethodType)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Display label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                isManual ? "e.g. Vodafone Cash – 01012345678"
                : isPaymob ? "Paymob Integration"
                : isSubscriptionBase ? "Subscription-base Checkout"
                : "Stripe Live"
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Manual-specific fields */}
          {isManual && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Instructions (shown to member at checkout)</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Send the amount to Vodafone Cash number 01012345678, then upload the confirmation screenshot."
                  rows={3}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Account details</label>
                <input
                  value={accountDetails}
                  onChange={(e) => setAccountDetails(e.target.value)}
                  placeholder="01012345678"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </>
          )}

          {/* Paymob-specific fields */}
          {isPaymob && (
            <>
              {[
                { label: "API Key",        value: apiKey,         set: setApiKey,        ph: "Your Paymob API key" },
                { label: "Integration ID", value: integrationId,  set: setIntegrationId, ph: "e.g. 12345" },
                { label: "HMAC Secret",    value: hmacSecret,     set: setHmacSecret,    ph: "Your HMAC secret" },
                { label: "iFrame ID (optional)", value: iframeId, set: setIframeId,      ph: "e.g. 67890" },
              ].map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <input
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.ph}
                    type="password"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              ))}
            </>
          )}

          {/* Stripe-specific fields */}
          {isStripe && (
            <>
              {[
                { label: "Secret Key",       value: secretKey,      set: setSecretKey,      ph: "sk_live_..." },
                { label: "Webhook Secret",   value: webhookSecret,  set: setWebhookSecret,  ph: "whsec_..." },
                { label: "Publishable Key",  value: publishableKey, set: setPublishableKey, ph: "pk_live_..." },
              ].map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <input
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.ph}
                    type="password"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              ))}
            </>
          )}

          {/* Subscription-base-specific fields */}
          {isSubscriptionBase && (
            <>
              <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-3 py-2.5 text-xs text-violet-700 dark:text-violet-300">
                Members will be redirected to the external Subscription-base checkout. Activation is
                driven by inbound webhooks — make sure your webhook endpoint is configured in the
                external system.
              </div>
              {[
                { label: "Base URL",                    value: subBaseUrl,        set: setSubBaseUrl,        ph: "https://p.englishsuperfast.com", pw: false },
                { label: "Admin API Key",               value: subAdminApiKey,    set: setSubAdminApiKey,    ph: "Your admin API key",             pw: true  },
                { label: "Webhook Secret (optional)",   value: subWebhookSecret,  set: setSubWebhookSecret,  ph: "HMAC secret for webhook verify", pw: true  },
              ].map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <input
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.ph}
                    type={f.pw ? "password" : "text"}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              ))}
            </>
          )}

          {formError && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />{formError}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={isPending} className="gap-1.5">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showForm && (
        <Button variant="outline" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add payment method
        </Button>
      )}
    </div>
  );
}
