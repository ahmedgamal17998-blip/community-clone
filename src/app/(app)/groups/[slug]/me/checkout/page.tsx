/**
 * Subscription checkout page — embedded inside the community so the member
 * never leaves. Shows a locked identity summary (from session) above the
 * external payment iframe.
 *
 * Route: /groups/[slug]/me/checkout?planId=<id>&methodId=<id>
 *
 * Flow:
 *  1. Validate session + group membership
 *  2. Fetch plan + payment-method credentials server-side
 *  3. Build the Subscription-base checkout URL (with email/name pre-filled)
 *  4. Render: order summary card + locked identity card + payment iframe
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { decryptJson } from "@/lib/encryption";
import type { SubscriptionBaseCredentials } from "@/server/payment-methods";
import { ArrowLeft, Lock, User, Mail } from "lucide-react";
import { CheckoutIframe } from "./_components/CheckoutIframe";

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$", eur: "€", gbp: "£", egp: "E£",
  sar: "﷼", aed: "د.إ", kwd: "د.ك",
};

function formatPrice(priceCents: number, currency: string) {
  const sym = CURRENCY_SYMBOLS[currency.toLowerCase()] ?? currency.toUpperCase();
  return `${sym}${(priceCents / 100).toFixed(2)}`;
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { planId?: string; methodId?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { planId, methodId } = searchParams;
  if (!planId || !methodId) notFound();

  // ── Resolve group ──────────────────────────────────────────────────────────
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true, name: true, tenantId: true },
  });
  if (!group) notFound();

  // Must be an active member
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { state: true },
  });
  if (!membership || membership.state !== "ACTIVE") redirect(`/groups/${group.slug}`);

  // ── Fetch plan ─────────────────────────────────────────────────────────────
  const plan = await db.subscriptionPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      name: true,
      priceCents: true,
      currency: true,
      durationDays: true,
      groupId: true,
      active: true,
      externalProductSlug: true,
      externalProductId: true,
      externalPlanType: true,
    },
  });
  if (!plan || plan.groupId !== group.id || !plan.active) notFound();

  // ── Fetch payment method credentials ──────────────────────────────────────
  const pm = await db.paymentMethod.findUnique({
    where: { id: methodId },
    select: { type: true, active: true, tenantId: true, credentialsEnc: true },
  });
  if (!pm || !pm.active || pm.tenantId !== group.tenantId) notFound();
  if (pm.type !== "SUBSCRIPTION_BASE") notFound(); // Only for Subscription-base

  let creds: SubscriptionBaseCredentials | null = null;
  if (pm.credentialsEnc) {
    try {
      creds = decryptJson<SubscriptionBaseCredentials>(pm.credentialsEnc);
    } catch {
      // leave null — will 404 below
    }
  }
  if (!creds?.baseUrl) notFound();

  // ── Fetch user identity ────────────────────────────────────────────────────
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phone: true },
  });
  if (!user) notFound();

  // ── Build checkout URL ─────────────────────────────────────────────────────
  const checkoutPath = plan.externalProductSlug
    ? `/subscribe/${plan.externalProductSlug}`
    : `/checkout/product/${plan.externalProductId}`;
  const checkoutUrl = new URL(`${creds.baseUrl.replace(/\/$/, "")}${checkoutPath}`);

  // Pre-fill from session — user can see these on OUR page (locked),
  // and the payment system will have them as defaults in the form.
  if (user.email) checkoutUrl.searchParams.set("email", user.email);
  if (user.name)  checkoutUrl.searchParams.set("name",  user.name);
  if (user.phone) checkoutUrl.searchParams.set("phone", user.phone);
  if (plan.externalPlanType) checkoutUrl.searchParams.set("plan", plan.externalPlanType);

  const priceLabel    = formatPrice(plan.priceCents, plan.currency);
  const durationLabel = plan.durationDays >= 365
    ? `${Math.round(plan.durationDays / 365)} year`
    : plan.durationDays >= 28
    ? `${Math.round(plan.durationDays / 30)} month`
    : `${plan.durationDays} days`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">

      {/* Back link */}
      <Link
        href={`/groups/${group.slug}/me`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Account
      </Link>

      <h1 className="text-2xl font-semibold">Complete your payment</h1>

      {/* Summary row */}
      <div className="grid gap-4 sm:grid-cols-2">

        {/* Order summary */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Order summary
          </p>
          <p className="text-lg font-bold">{plan.name}</p>
          <p className="mt-1 text-3xl font-extrabold text-primary">
            {priceLabel}
            <span className="ms-1.5 text-base font-normal text-muted-foreground">
              / {durationLabel}
            </span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {group.name}
          </p>
        </div>

        {/* Locked identity */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Paying as
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">{user.name ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm">{user.email ?? "—"}</span>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Pre-filled from your account. Your subscription will be linked to this identity.
          </p>
        </div>
      </div>

      {/* Payment iframe */}
      <CheckoutIframe
        checkoutUrl={checkoutUrl.toString()}
        groupSlug={group.slug}
      />
    </div>
  );
}
