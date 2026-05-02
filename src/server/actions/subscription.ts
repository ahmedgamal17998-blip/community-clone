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
  externalProductId?: number | null;
  externalProductSlug?: string | null;
  externalPlanType?: string | null;
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
      externalProductId: params.externalProductId ?? null,
      externalProductSlug: params.externalProductSlug || null,
      externalPlanType: params.externalPlanType || null,
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
  externalProductId?: number | null;
  externalProductSlug?: string | null;
  externalPlanType?: string | null;
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
      ...(params.externalProductId !== undefined && {
        externalProductId: params.externalProductId,
      }),
      ...(params.externalProductSlug !== undefined && {
        externalProductSlug: params.externalProductSlug || null,
      }),
      ...(params.externalPlanType !== undefined && {
        externalPlanType: params.externalPlanType || null,
      }),
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
  // Optional fields populated when the activation came from a payment
  // webhook (vs. a manual admin grant).
  externalSubscriptionId?: number | null;
  externalProductId?: number | null;
  externalPlanType?: string | null;
  paymobOrderId?: string | null;
  lastTransactionId?: string | null;
  paidAt?: Date | null;
}) {
  const plan = await db.subscriptionPlan.findUnique({
    where: { id: params.planId },
  });
  if (!plan || plan.groupId !== params.groupId) throw new Error("PLAN_NOT_FOUND");

  const now = new Date();
  // Multi-plan support: a user can hold several subs in the same group,
  // one per plan. Match by the most reliable key:
  //   1. externalSubscriptionId (renewals from the payment system)
  //   2. (userId, groupId, planId) — same plan being renewed/reactivated
  const existing = params.externalSubscriptionId
    ? await db.subscription.findFirst({
        where: {
          userId: params.userId,
          groupId: params.groupId,
          externalSubscriptionId: params.externalSubscriptionId,
        },
      })
    : await db.subscription.findFirst({
        where: {
          userId: params.userId,
          groupId: params.groupId,
          planId: params.planId,
        },
        orderBy: { currentPeriodEnd: "desc" },
      });

  const fromDate =
    existing && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
  const newEnd = new Date(fromDate.getTime() + plan.durationDays * 86400000);

  let sub;
  if (existing) {
    sub = await db.subscription.update({
      where: { id: existing.id },
      data: {
        planId: params.planId,
        currentPeriodEnd: newEnd,
        status: "ACTIVE",
        cancelRequestedAt: null, // re-activation clears any prior cancel intent
        externalRef: params.externalRef ?? existing.externalRef,
        externalSubscriptionId:
          params.externalSubscriptionId ?? existing.externalSubscriptionId,
        externalProductId:
          params.externalProductId ?? existing.externalProductId,
        externalPlanType:
          params.externalPlanType ?? existing.externalPlanType,
        paymobOrderId: params.paymobOrderId ?? existing.paymobOrderId,
        lastTransactionId:
          params.lastTransactionId ?? existing.lastTransactionId,
        paidAt: params.paidAt ?? existing.paidAt,
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
        externalSubscriptionId: params.externalSubscriptionId ?? null,
        externalProductId: params.externalProductId ?? null,
        externalPlanType: params.externalPlanType ?? null,
        paymobOrderId: params.paymobOrderId ?? null,
        lastTransactionId: params.lastTransactionId ?? null,
        paidAt: params.paidAt ?? null,
      },
    });
  }

  // Also lift any membership lock if present
  await db.groupMembership.updateMany({
    where: { groupId: params.groupId, userId: params.userId },
    data: { lockedAt: null, accessExpiresAt: newEnd },
  });

  // Auto-grant MemberAccess for every resource the plan unlocks. The
  // member's hasAccess() now naturally returns true for those channels /
  // courses / events until the subscription period ends.
  await syncSubscriptionAccessGrants({
    userId: params.userId,
    groupId: params.groupId,
    planId: params.planId,
    expiresAt: newEnd,
  });

  // M28: Plan→Track auto-routing fires ONLY on first activation, not on
  // renewals. Otherwise every renewal would re-apply REPLACE mode and
  // silently undo any manual track move the admin had made between cycles.
  // Renewals should respect the user's current track state.
  if (plan.mappedTrackId && !existing) {
    try {
      const { assignTrackToUser } = await import("@/server/tracks");
      await assignTrackToUser({
        userId: params.userId,
        groupId: params.groupId,
        trackId: plan.mappedTrackId,
        source: "PLAN",
      });
    } catch (e) {
      // Plan auto-routing failure (e.g. mapped track was archived) must not
      // block payment activation. Log + continue — admin can fix the plan
      // later and reassign manually.
      // eslint-disable-next-line no-console
      console.error("Plan→Track auto-routing failed for plan", plan.id, e);
    }
  }

  revalidatePath(`/groups/[slug]/me`, "page");
  return sub;
}

/**
 * Cancel one specific subscription by ID. Either the owner of the
 * subscription or an admin with SUBS_MANAGE may call this.
 *
 * Hard cancel — sets status=CANCELED and revokes plan grants now.
 * For the "cancel + keep access until period end" flow, see
 * `requestCancelSubscriptionAction` below.
 */
export async function cancelSubscriptionAction(params: {
  subscriptionId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const sub = await db.subscription.findUnique({
    where: { id: params.subscriptionId },
    select: { userId: true, groupId: true, planId: true },
  });
  if (!sub) return { ok: false as const, error: "Subscription not found" };

  if (session.user.id !== sub.userId) {
    await requireCapability({
      userId: session.user.id,
      groupId: sub.groupId,
      capability: "SUBS_MANAGE",
    });
  }

  await db.subscription.update({
    where: { id: params.subscriptionId },
    data: { status: "CANCELED", cancelRequestedAt: new Date() },
  });
  await revokeSubscriptionAccessGrants({
    userId: sub.userId,
    planId: sub.planId,
  });

  revalidatePath(`/groups/[slug]/me`, "page");
  return { ok: true as const };
}

/**
 * Mark a subscription as "cancel-at-period-end". The sub stays ACTIVE
 * (and grants stay live) until `currentPeriodEnd` — at which point the
 * payment system will fire a `cancelled` webhook and we hard-cancel.
 *
 * This is the user-facing flow when a member taps "Cancel" on /me.
 */
export async function requestCancelSubscriptionAction(params: {
  subscriptionId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const sub = await db.subscription.findUnique({
    where: { id: params.subscriptionId },
    select: { userId: true, groupId: true },
  });
  if (!sub) return { ok: false as const, error: "Subscription not found" };

  if (session.user.id !== sub.userId) {
    await requireCapability({
      userId: session.user.id,
      groupId: sub.groupId,
      capability: "SUBS_MANAGE",
    });
  }

  await db.subscription.update({
    where: { id: params.subscriptionId },
    data: { cancelRequestedAt: new Date() },
  });

  revalidatePath(`/groups/[slug]/me`, "page");
  return { ok: true as const };
}

/**
 * Set a specific subscription's status. Admin-only with SUBS_MANAGE.
 * Used by the per-row Cancel / Pause / Resume buttons in the admin
 * member panel — lets the admin act on one row when a member has
 * multiple subscription history entries.
 *
 * status: ACTIVE  → restore (only meaningful for paused/canceled rows)
 *         PAUSED  → temporary hold; hasAccess() denies during pause
 *         CANCELED → permanent end
 */
export async function setSubscriptionStatusAction(params: {
  subscriptionId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELED";
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const sub = await db.subscription.findUnique({
    where: { id: params.subscriptionId },
    select: {
      groupId: true,
      userId: true,
      planId: true,
      currentPeriodEnd: true,
    },
  });
  if (!sub) return { ok: false as const, error: "Subscription not found" };

  await requireCapability({
    userId: session.user.id,
    groupId: sub.groupId,
    capability: "SUBS_MANAGE",
  });

  await db.subscription.update({
    where: { id: params.subscriptionId },
    data: { status: params.status },
  });

  // Side-effects on plan-bundled MemberAccess:
  //   • PAUSED / CANCELED → revoke (set expiresAt = now)
  //   • ACTIVE (re-activate) → re-sync grants with the original period end
  //                            (or now+1day if the period already ended)
  if (params.status === "PAUSED" || params.status === "CANCELED") {
    await revokeSubscriptionAccessGrants({
      userId: sub.userId,
      planId: sub.planId,
    });
  } else if (params.status === "ACTIVE") {
    const expiresAt =
      sub.currentPeriodEnd > new Date()
        ? sub.currentPeriodEnd
        : new Date(Date.now() + 86_400_000); // give 1 day if expired
    await syncSubscriptionAccessGrants({
      userId: sub.userId,
      groupId: sub.groupId,
      planId: sub.planId,
      expiresAt,
      adminId: session.user.id,
    });
  }

  revalidatePath(`/groups/[slug]/admin/members/${sub.userId}`, "page");
  revalidatePath(`/groups/[slug]/me`, "page");
  return { ok: true as const };
}

// ─── Phase 1: Plan-includes-resources ──────────────────────────────────────

/**
 * Replace the full set of resources a plan unlocks with the provided lists.
 * Idempotent — caller passes the desired final state, action diffs.
 */
export async function setPlanResourcesAction(params: {
  groupId: string;
  planId: string;
  channelIds: string[];
  courseIds: string[];
  eventIds: string[];
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  // Verify plan belongs to the group.
  const plan = await db.subscriptionPlan.findUnique({
    where: { id: params.planId },
    select: { groupId: true },
  });
  if (!plan || plan.groupId !== params.groupId) {
    return { ok: false as const, error: "Plan mismatch" };
  }

  // Replace all rows in a transaction. Simpler than diffing for now.
  await db.$transaction([
    db.planResource.deleteMany({ where: { planId: params.planId } }),
    db.planResource.createMany({
      data: [
        ...params.channelIds.map((id) => ({
          planId: params.planId,
          resourceType: "CHANNEL",
          resourceId: id,
        })),
        ...params.courseIds.map((id) => ({
          planId: params.planId,
          resourceType: "COURSE",
          resourceId: id,
        })),
        ...params.eventIds.map((id) => ({
          planId: params.planId,
          resourceType: "EVENT",
          resourceId: id,
        })),
      ],
    }),
  ]);

  // Re-sync access grants for every ACTIVE subscriber of this plan so the
  // bundle change propagates immediately.
  const activeSubs = await db.subscription.findMany({
    where: { planId: params.planId, status: "ACTIVE" },
  });
  for (const sub of activeSubs) {
    await syncSubscriptionAccessGrants({
      userId: sub.userId,
      groupId: sub.groupId,
      planId: sub.planId,
      expiresAt: sub.currentPeriodEnd,
      adminId: session.user.id,
    });
  }

  revalidatePath(`/groups/[slug]/admin/plans`, "page");
  return { ok: true as const };
}

/**
 * Internal helper — given a user + plan + expiry, ensure they have a
 * MemberAccess GRANT for every PlanResource in that plan, with
 * expiresAt set to the subscription period end.
 */
export async function syncSubscriptionAccessGrants(params: {
  userId: string;
  groupId: string;
  planId: string;
  expiresAt: Date;
  adminId?: string;
}) {
  const resources = await db.planResource.findMany({
    where: { planId: params.planId },
  });
  if (resources.length === 0) return;

  for (const r of resources) {
    await db.memberAccess.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId: params.userId,
          resourceType: r.resourceType,
          resourceId: r.resourceId,
        },
      },
      update: {
        mode: "GRANT",
        expiresAt: params.expiresAt,
        source: "PAYMENT",
        grantedById: params.adminId ?? null,
      },
      create: {
        userId: params.userId,
        groupId: params.groupId,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        mode: "GRANT",
        expiresAt: params.expiresAt,
        source: "PAYMENT",
        grantedById: params.adminId ?? null,
      },
    });
  }
}

/**
 * Internal helper — expire all PAYMENT-sourced MemberAccess records for
 * resources tied to this plan. Used when a subscription is paused /
 * canceled / expired. We don't delete (history is kept) — we set
 * expiresAt to now so hasAccess() denies.
 */
export async function revokeSubscriptionAccessGrants(params: {
  userId: string;
  planId: string;
}) {
  const resources = await db.planResource.findMany({
    where: { planId: params.planId },
    select: { resourceType: true, resourceId: true },
  });
  if (resources.length === 0) return;

  const now = new Date();
  for (const r of resources) {
    await db.memberAccess.updateMany({
      where: {
        userId: params.userId,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        source: "PAYMENT",
      },
      data: { expiresAt: now },
    });
  }
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
