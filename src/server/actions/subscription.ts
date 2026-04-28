"use server";

/**
 * M18: Subscription plan + Subscription management.
 *
 * NOTE: User explicitly said NOT to use Stripe — these actions handle the
 * subscription state itself (creating plans, activating subscriptions,
 * extending periods). The actual payment integration will be wired to a
 * custom in-house payment system later via the webhook at
 * /api/webhooks/payment.
 */
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";

export async function createPlanAction(params: {
  groupId: string;
  name: string;
  description?: string;
  durationDays: number;
  priceCents: number;
  currency?: string;
  active?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  const plan = await db.subscriptionPlan.create({
    data: {
      groupId: params.groupId,
      name: params.name,
      description: params.description,
      durationDays: params.durationDays,
      priceCents: params.priceCents,
      currency: params.currency ?? "usd",
      active: params.active ?? true,
    },
  });

  revalidatePath(`/groups/[slug]/admin/plans`, "page");
  return plan;
}

export async function updatePlanAction(params: {
  groupId: string;
  planId: string;
  name?: string;
  description?: string;
  durationDays?: number;
  priceCents?: number;
  active?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  await db.subscriptionPlan.update({
    where: { id: params.planId },
    data: {
      name: params.name,
      description: params.description,
      durationDays: params.durationDays,
      priceCents: params.priceCents,
      active: params.active,
    },
  });
  revalidatePath(`/groups/[slug]/admin/plans`, "page");
}

/**
 * Activate / extend a user's subscription. If they already have an ACTIVE
 * subscription, extend its `currentPeriodEnd` by `durationDays`. Otherwise
 * create a fresh row.
 *
 * Used by:
 *  - Admin manual extension
 *  - Custom payment webhook (after successful charge)
 */
export async function activateSubscriptionAction(params: {
  groupId: string;
  userId: string;
  planId: string;
  externalRef?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  return _activateSubscriptionInternal(params);
}

/**
 * Internal — bypasses auth check for use by webhook handler.
 * Webhook authenticates via shared secret instead.
 */
export async function _activateSubscriptionInternal(params: {
  groupId: string;
  userId: string;
  planId: string;
  externalRef?: string;
}) {
  const plan = await db.subscriptionPlan.findUnique({
    where: { id: params.planId },
  });
  if (!plan || plan.groupId !== params.groupId) throw new Error("PLAN_NOT_FOUND");

  const now = new Date();
  const existing = await db.subscription.findFirst({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      status: "ACTIVE",
    },
  });

  const fromDate =
    existing && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
  const newEnd = new Date(fromDate.getTime() + plan.durationDays * 86400000);

  let sub;
  if (existing) {
    sub = await db.subscription.update({
      where: { id: existing.id },
      data: {
        currentPeriodEnd: newEnd,
        status: "ACTIVE",
        externalRef: params.externalRef ?? existing.externalRef,
      },
    });
  } else {
    sub = await db.subscription.create({
      data: {
        userId: params.userId,
        groupId: params.groupId,
        planId: params.planId,
        currentPeriodEnd: newEnd,
        status: "ACTIVE",
        externalRef: params.externalRef,
      },
    });
  }

  // Also lift any membership lock if present
  await db.groupMembership.updateMany({
    where: { groupId: params.groupId, userId: params.userId },
    data: { lockedAt: null, accessExpiresAt: newEnd },
  });

  revalidatePath(`/groups/[slug]/me`, "page");
  return sub;
}

export async function cancelSubscriptionAction(params: {
  groupId: string;
  userId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  // Either the user themselves OR an admin with SUBS_MANAGE
  if (session.user.id !== params.userId) {
    await requireCapability({
      userId: session.user.id,
      groupId: params.groupId,
      capability: "SUBS_MANAGE",
    });
  }

  await db.subscription.updateMany({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      status: "ACTIVE",
    },
    data: { status: "CANCELED" },
  });

  revalidatePath(`/groups/[slug]/me`, "page");
}

/**
 * Member edits their own profile (photo / name / bio).
 */
export async function updateProfileAction(params: {
  name?: string;
  bio?: string;
  image?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  await db.user.update({
    where: { id: session.user.id },
    data: {
      name: params.name,
      bio: params.bio,
      image: params.image,
    },
  });

  revalidatePath("/settings/profile");
}
