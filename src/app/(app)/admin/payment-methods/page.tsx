/**
 * /admin/payment-methods — Manage payment methods for the tenant.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { CreditCard, Plus, ShieldCheck } from "lucide-react";
import { PaymentMethodsClient } from "@/components/admin/PaymentMethodsClient";

const TYPE_LABELS: Record<string, string> = {
  MANUAL_VODAFONE_CASH:  "Vodafone Cash",
  MANUAL_INSTAPAY:       "InstaPay",
  MANUAL_BANK_TRANSFER:  "Bank Transfer",
  MANUAL_FAWRY:          "Fawry",
  MANUAL_CUSTOM:         "Custom Manual",
  PAYMOB:                "Paymob (Automated)",
  STRIPE:                "Stripe (Automated)",
  SUBSCRIPTION_BASE:     "Subscription-base (External)",
};

export default async function PaymentMethodsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await db.tenant.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, subscriptionBaseEnabled: true },
  });
  if (!tenant) redirect("/admin/setup");

  const methods = await db.paymentMethod.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, type: true, label: true, active: true, isDefault: true, createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Methods</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Configure how members pay for group access. Credentials are encrypted at rest.
          </p>
        </div>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <p className="text-xs text-muted-foreground">
          All API keys and secrets are encrypted with AES-256-GCM before storage.
          They are never returned to the browser.
        </p>
      </div>

      <PaymentMethodsClient
        tenantId={tenant.id}
        methods={methods.map((m) => ({ ...m, typeLabel: TYPE_LABELS[m.type] ?? m.type }))}
        subscriptionBaseEnabled={tenant.subscriptionBaseEnabled}
      />
    </div>
  );
}
