/**
 * Inbound webhook handler for the external Subscription-base / Paymob
 * payment system.
 *
 * Supported events (Subscription-base outbound-webhook.routes.js):
 *   payment_success | renewal_success
 *     → activate / extend the matching Subscription, sync plan grants
 *   payment_failed  | renewal_failed
 *     → log only (no access change). Renewal retries handled by Paymob.
 *   cancel_requested
 *     → mark Subscription.cancelRequestedAt; access stays until period end.
 *   cancelled | expired
 *     → hard-cancel Subscription, revoke plan grants immediately.
 *
 * Idempotency:
 *   transaction_id is unique on PaymentWebhookEvent — duplicate retries
 *   no-op and return 200.
 *
 * Security:
 *   When PAYMENT_WEBHOOK_SECRET is set, the handler verifies an
 *   HMAC-SHA256 signature in `x-webhook-signature` header against the
 *   raw body. If the env var is unset, signature is logged but not
 *   enforced — Phase 1 wiring before HMAC ships on the payment-system
 *   side. Always set the secret in production.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/server/db";
import {
  _activateSubscriptionInternal,
  revokeSubscriptionAccessGrants,
} from "@/server/actions/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentEvent =
  | "payment_success"
  | "renewal_success"
  | "payment_failed"
  | "renewal_failed"
  | "cancel_requested"
  | "cancelled"
  | "expired";

type WebhookPayload = {
  event: PaymentEvent;
  type?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  plan?: string;
  product_name?: string;
  product_id?: string | number;
  payment_status?: string;
  payment_method?: string;
  amount?: number;
  currency?: string;
  date_of_creation?: string;
  next_renewal?: string;
  transaction_id?: string | number;
  subscription_id?: number;
  coupon_code?: string | null;
  discount_cents?: number | null;
};

function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return true; // not enforced yet (Phase 1)
  if (!headerSig) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(headerSig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headerSig = req.headers.get("x-webhook-signature");
  const signatureOk = verifySignature(rawBody, headerSig);

  if (process.env.PAYMENT_WEBHOOK_SECRET && !signatureOk) {
    return NextResponse.json(
      { ok: false, error: "INVALID_SIGNATURE" },
      { status: 401 },
    );
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const event = payload.event;
  const txId = payload.transaction_id ? String(payload.transaction_id) : null;
  const externalSubId = payload.subscription_id ?? null;
  const email = payload.email?.trim().toLowerCase() ?? null;

  // Idempotency: if we've already processed this transaction, no-op.
  if (txId) {
    const existing = await db.paymentWebhookEvent.findUnique({
      where: { transactionId: txId },
    });
    if (existing?.processed) {
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  // Persist the event row before side effects so we always have a trail.
  const eventRow = await db.paymentWebhookEvent.create({
    data: {
      event,
      transactionId: txId,
      externalSubscriptionId: externalSubId,
      email,
      payload: payload as unknown as object,
      signatureOk,
    },
  });

  try {
    switch (event) {
      case "payment_success":
        await handleActivation(payload);
        break;
      case "renewal_success":
        // For renewals we prefer to look up by subscription_id (already stored
        // from the initial payment) so the correct member is matched even if
        // the webhook payload email ever drifts.
        await handleRenewal(payload);
        break;
      case "cancel_requested":
        await handleCancelRequested(payload);
        break;
      case "cancelled":
      case "expired":
        await handleHardCancel(payload);
        break;
      case "payment_failed":
      case "renewal_failed":
        // Log only.
        break;
      default:
        await db.paymentWebhookEvent.update({
          where: { id: eventRow.id },
          data: { errorMessage: `Unknown event: ${event}` },
        });
        return NextResponse.json({ ok: false, error: "UNKNOWN_EVENT" });
    }

    await db.paymentWebhookEvent.update({
      where: { id: eventRow.id },
      data: { processed: true, processedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.paymentWebhookEvent.update({
      where: { id: eventRow.id },
      data: { errorMessage: message },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────

async function resolvePlanAndUser(payload: WebhookPayload) {
  if (!payload.email) throw new Error("MISSING_EMAIL");
  if (payload.product_id == null) throw new Error("MISSING_PRODUCT_ID");
  if (!payload.plan) throw new Error("MISSING_PLAN");

  const productId = Number(payload.product_id);
  if (!Number.isFinite(productId)) throw new Error("INVALID_PRODUCT_ID");

  const plan = await db.subscriptionPlan.findFirst({
    where: {
      externalProductId: productId,
      externalPlanType: payload.plan,
      active: true,
    },
  });
  if (!plan) {
    throw new Error(
      `PLAN_NOT_MAPPED: productId=${productId}, planType=${payload.plan}`,
    );
  }

  const email = payload.email.trim().toLowerCase();
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) throw new Error(`USER_NOT_FOUND: ${email}`);

  return { plan, user };
}

async function handleActivation(payload: WebhookPayload) {
  const { plan, user } = await resolvePlanAndUser(payload);

  // Make sure the user is a member of the group (and ACTIVE). If they
  // aren't a member we auto-create the membership — covers the case
  // where someone paid first and is being onboarded.
  const existingMembership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: plan.groupId, userId: user.id } },
  });
  if (!existingMembership) {
    await db.groupMembership.create({
      data: {
        groupId: plan.groupId,
        userId: user.id,
        role: "MEMBER",
        state: "ACTIVE",
      },
    });
  } else if (existingMembership.state !== "ACTIVE") {
    await db.groupMembership.update({
      where: { groupId_userId: { groupId: plan.groupId, userId: user.id } },
      data: { state: "ACTIVE", lockedAt: null },
    });
  }

  await _activateSubscriptionInternal({
    groupId: plan.groupId,
    userId: user.id,
    planId: plan.id,
    externalSubscriptionId: payload.subscription_id ?? null,
    externalProductId:
      payload.product_id != null ? Number(payload.product_id) : null,
    externalPlanType: payload.plan ?? null,
    lastTransactionId: payload.transaction_id
      ? String(payload.transaction_id)
      : null,
    paidAt: payload.date_of_creation
      ? new Date(payload.date_of_creation)
      : new Date(),
  });
}

async function handleCancelRequested(payload: WebhookPayload) {
  const sub = await findSubscriptionFromPayload(payload);
  if (!sub) return;
  await db.subscription.update({
    where: { id: sub.id },
    data: { cancelRequestedAt: new Date() },
  });
}

async function handleHardCancel(payload: WebhookPayload) {
  const sub = await findSubscriptionFromPayload(payload);
  if (!sub) return;
  await db.subscription.update({
    where: { id: sub.id },
    data: { status: "CANCELED" },
  });
  await revokeSubscriptionAccessGrants({
    userId: sub.userId,
    planId: sub.planId,
  });
}

/**
 * renewal_success — extend an existing subscription.
 *
 * Strategy (preference order):
 *  1. subscription_id  → look up the existing Subscription row to get the
 *     userId and planId, then call _activateSubscriptionInternal. This is the
 *     most reliable path and prevents identity mismatch entirely: the member
 *     who originally paid is always the one whose access gets renewed.
 *  2. Fallback → treat identically to payment_success (email lookup). This
 *     covers edge cases where subscription_id wasn't stored on the first run.
 */
async function handleRenewal(payload: WebhookPayload) {
  if (payload.subscription_id) {
    const existing = await db.subscription.findFirst({
      where: { externalSubscriptionId: payload.subscription_id },
      select: { userId: true, groupId: true, planId: true },
    });

    if (existing) {
      // Drive the renewal through the same activation helper so plan-resource
      // grants are refreshed and the period-end is extended properly.
      await _activateSubscriptionInternal({
        groupId:                existing.groupId,
        userId:                 existing.userId,
        planId:                 existing.planId,
        externalSubscriptionId: payload.subscription_id,
        externalProductId:      payload.product_id != null ? Number(payload.product_id) : null,
        externalPlanType:       payload.plan ?? null,
        lastTransactionId:      payload.transaction_id ? String(payload.transaction_id) : null,
        paidAt:                 payload.date_of_creation ? new Date(payload.date_of_creation) : new Date(),
      });
      return;
    }
  }

  // Fallback: treat as fresh payment_success (email lookup).
  await handleActivation(payload);
}

async function findSubscriptionFromPayload(payload: WebhookPayload) {
  if (payload.subscription_id) {
    const sub = await db.subscription.findFirst({
      where: { externalSubscriptionId: payload.subscription_id },
    });
    if (sub) return sub;
  }
  if (payload.transaction_id) {
    const sub = await db.subscription.findFirst({
      where: { lastTransactionId: String(payload.transaction_id) },
    });
    if (sub) return sub;
  }
  return null;
}
