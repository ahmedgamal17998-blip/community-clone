/**
 * Member subscription server actions.
 *
 * Flows:
 *   A. Free join       — group.isPaid = false → create ACTIVE membership directly
 *   B. Manual payment  — member uploads proof → PENDING_APPROVAL → admin approves/rejects
 *   C. Automated       — Paymob/Stripe webhook → ACTIVE (handled in webhook routes)
 *
 * Auto-lock cron at /api/cron/expire-subscriptions handles ACTIVE → EXPIRED.
 */
"use server";

import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { enforceLimit, incrementUsage } from "@/server/billing/limits";
import { PlanLimitExceeded } from "@/server/billing/errors";
import { Prisma } from "@prisma/client";
import { getPaymentMethodCredentials, type SubscriptionBaseCredentials } from "@/server/payment-methods";

// ─── Subscribe (initiate) ─────────────────────────────────────────────────────

const SubscribeSchema = z.object({
  groupId:         z.string().cuid(),
  planId:          z.string().cuid(),
  paymentMethodId: z.string().cuid(),
  paymentProofUrl: z.string().url().optional(),
  paymentRef:      z.string().max(100).optional(),
  amountPaid:      z.number().int().min(0).optional(),
});

export type SubscribeInput = z.infer<typeof SubscribeSchema>;

export async function subscribeAction(
  raw: SubscribeInput,
): Promise<{ ok: true; subscriptionId: string; status: string; checkoutUrl?: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const parsed = SubscribeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]!.message };

  const { groupId, planId, paymentMethodId, paymentProofUrl, paymentRef, amountPaid } = parsed.data;
  const userId = session.user.id;

  // Fetch plan details
  const plan = await db.subscriptionPlan.findUnique({
    where: { id: planId },
    select: { id: true, durationDays: true, groupId: true, active: true },
  });
  if (!plan || plan.groupId !== groupId) return { ok: false, error: "Invalid plan" };
  if (!plan.active) return { ok: false, error: "This plan is no longer available" };

  // Fetch payment method and determine flow
  const pm = await db.paymentMethod.findUnique({
    where: { id: paymentMethodId },
    select: { type: true, active: true },
  });
  if (!pm || !pm.active) return { ok: false, error: "Payment method not available" };

  // ── SUBSCRIPTION_BASE: redirect to external checkout, no local sub row yet ──
  if (pm.type === "SUBSCRIPTION_BASE") {
    // Fetch the plan's external product slug + plan type
    const planFull = await db.subscriptionPlan.findUnique({
      where: { id: planId },
      select: {
        externalProductSlug: true,
        externalProductId:   true,
        externalPlanType:    true,
      },
    });
    const productSlug = planFull?.externalProductSlug;
    const productId   = planFull?.externalProductId;

    if (!productSlug && !productId) {
      return { ok: false, error: "This plan is not yet linked to a Subscription-base product. Ask the workspace admin to configure it." };
    }

    const creds = await getPaymentMethodCredentials(paymentMethodId) as SubscriptionBaseCredentials | null;
    if (!creds?.baseUrl) {
      return { ok: false, error: "Subscription-base credentials are not configured." };
    }

    // Prefill user info and build return URLs so the member lands back
    // on the community after payment succeeds or is cancelled.
    const userRow = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    // Build checkout URL: prefer slug route, fall back to product-id route
    const checkoutPath = productSlug
      ? `/subscribe/${productSlug}`
      : `/checkout/product/${productId}`;
    const checkoutUrl = new URL(`${creds.baseUrl.replace(/\/$/, "")}${checkoutPath}`);

    // Prefill member details so they don't have to retype on the payment page
    if (userRow?.email) checkoutUrl.searchParams.set("email", userRow.email);
    if (userRow?.name)  checkoutUrl.searchParams.set("name",  userRow.name);
    if (userRow?.phone) checkoutUrl.searchParams.set("phone", userRow.phone);
    if (planFull?.externalPlanType) {
      checkoutUrl.searchParams.set("plan", planFull.externalPlanType);
    }

    // Note: success_url / cancel_url are configured manually in the payment
    // system's admin panel — not passed as query params here.

    // Return early — activation will happen via the /api/webhooks/payment handler
    // once the member completes payment on the external system.
    return { ok: true, subscriptionId: "", status: "REDIRECT", checkoutUrl: checkoutUrl.toString() };
  }

  const isManual = pm.type.startsWith("MANUAL_");
  const status = isManual ? "PENDING_APPROVAL" : "ACTIVE";

  const currentPeriodEnd = new Date(
    Date.now() + plan.durationDays * 24 * 3_600_000,
  );

  try {
    const sub = await db.$transaction(async (tx) => {
      // Create or update membership (REQUESTED state for manual, will flip to ACTIVE on approval)
      const existingMembership = await tx.groupMembership.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });

      if (!existingMembership) {
        await tx.groupMembership.create({
          data: {
            groupId,
            userId,
            role:      "MEMBER",
            state:     isManual ? "REQUESTED" : "ACTIVE",
            hasAccess: !isManual,
          },
        });
      } else if (!isManual && existingMembership.state !== "ACTIVE") {
        await tx.groupMembership.update({
          where: { groupId_userId: { groupId, userId } },
          data: { state: "ACTIVE", hasAccess: true, accessRevokedAt: null },
        });
      }

      // Create subscription row
      const subscription = await tx.subscription.create({
        data: {
          userId,
          groupId,
          planId,
          paymentMethodId,
          paymentProofUrl: paymentProofUrl ?? null,
          paymentRef:      paymentRef ?? null,
          amountPaid:      amountPaid ?? null,
          status,
          currentPeriodEnd,
          startedAt: new Date(),
        },
      });

      return subscription;
    });

    return { ok: true, subscriptionId: sub.id, status };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "You already have an active subscription to this group." };
    }
    throw err;
  }
}

// ─── Update proof (member can upload proof after initiating) ─────────────────

export async function updateSubscriptionProofAction(
  subscriptionId: string,
  proofUrl: string,
  paymentRef?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { userId: true, status: true },
  });
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (sub.userId !== session.user.id) return { ok: false, error: "Unauthorized" };
  if (sub.status !== "PENDING_APPROVAL") return { ok: false, error: "Subscription is not awaiting approval" };

  await db.subscription.update({
    where: { id: subscriptionId },
    data: { paymentProofUrl: proofUrl, paymentRef: paymentRef ?? null },
  });
  return { ok: true };
}

// ─── Approve (admin) ──────────────────────────────────────────────────────────

export async function approveSubscriptionAction(
  subscriptionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      group: {
        include: { tenant: { select: { ownerId: true } } },
      },
    },
  });
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (sub.status !== "PENDING_APPROVAL") return { ok: false, error: "Already processed" };

  // Only group owner/admin can approve
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: sub.groupId, userId: session.user.id } },
    select: { role: true },
  });
  const isOwnerOfCommunity = sub.group.tenant.ownerId === session.user.id;
  const isAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";
  if (!isAdmin && !isOwnerOfCommunity) return { ok: false, error: "Unauthorized" };

  // Enforce member limit before activating
  try {
    await enforceLimit("members", sub.group.tenantId);
  } catch (e) {
    if (e instanceof PlanLimitExceeded) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  await db.$transaction([
    // Activate the subscription
    db.subscription.update({
      where: { id: subscriptionId },
      data: {
        status:      "ACTIVE",
        approvedById: session.user.id,
        approvedAt:   new Date(),
        paidAt:       new Date(),
      },
    }),
    // Activate the membership
    db.groupMembership.update({
      where: { groupId_userId: { groupId: sub.groupId, userId: sub.userId } },
      data: { state: "ACTIVE", hasAccess: true, accessRevokedAt: null },
    }),
  ]);

  // Grant access to plan resources
  const planResources = await db.planResource.findMany({ where: { planId: sub.planId } });
  if (planResources.length > 0) {
    await db.memberAccess.createMany({
      data: planResources.map((r) => ({
        userId:       sub.userId,
        groupId:      sub.groupId,
        resourceType: r.resourceType,
        resourceId:   r.resourceId,
        mode:         "GRANT",
        source:       "PAYMENT",
        expiresAt:    sub.currentPeriodEnd,
      })),
      skipDuplicates: true,
    });
  }

  await incrementUsage("currentMembers", sub.group.tenantId);
  return { ok: true };
}

// ─── Reject (admin) ───────────────────────────────────────────────────────────

export async function rejectSubscriptionAction(
  subscriptionId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      group: { include: { tenant: { select: { ownerId: true } } } },
    },
  });
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (sub.status !== "PENDING_APPROVAL") return { ok: false, error: "Already processed" };

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: sub.groupId, userId: session.user.id } },
    select: { role: true },
  });
  const isOwnerOfCommunity = sub.group.tenant.ownerId === session.user.id;
  const isAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";
  if (!isAdmin && !isOwnerOfCommunity) return { ok: false, error: "Unauthorized" };

  await db.$transaction([
    db.subscription.update({
      where: { id: subscriptionId },
      data: {
        status:         "REJECTED",
        approvedById:   session.user.id,
        approvedAt:     new Date(),
        rejectedReason: reason,
      },
    }),
    // Remove the REQUESTED membership (send them back to non-member)
    db.groupMembership.deleteMany({
      where: { groupId: sub.groupId, userId: sub.userId, state: "REQUESTED" },
    }),
  ]);

  return { ok: true };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** List pending subscriptions for a group (admin view). */
export async function getPendingSubscriptions(groupId: string) {
  return db.subscription.findMany({
    where: { groupId, status: "PENDING_APPROVAL" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true, handle: true } },
      plan: { select: { name: true, durationDays: true, priceCents: true, currency: true } },
      paymentMethod: { select: { type: true, label: true } },
    },
  });
}

/** Get a member's active subscription to a group. */
export async function getMemberSubscription(userId: string, groupId: string) {
  return db.subscription.findFirst({
    where: { userId, groupId, status: { in: ["ACTIVE", "PENDING_APPROVAL"] } },
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { name: true, durationDays: true, priceCents: true, currency: true } },
      paymentMethod: { select: { type: true, label: true } },
    },
  });
}

/** Get all subscriptions for a group (admin view with stats). */
export async function getGroupSubscriptions(groupId: string, status?: string) {
  return db.subscription.findMany({
    where: { groupId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, email: true, image: true, handle: true } },
      plan: { select: { name: true, priceCents: true, currency: true } },
      paymentMethod: { select: { type: true, label: true } },
      approvedBy: { select: { name: true } },
    },
  });
}
