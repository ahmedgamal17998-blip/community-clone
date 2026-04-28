/**
 * M18: Canonical access resolver.
 *
 * `hasAccess(userId, resourceType, resourceId)` returns true iff:
 *   1. There is a non-expired MemberAccess row for that resource, OR
 *   2. The user has an ACTIVE Subscription on the parent group, OR
 *   3. The resource type is GROUP and the membership has no `accessExpiresAt`
 *      OR `accessExpiresAt > now()` (legacy ungated members stay accessible).
 *
 * Layered behind UI: when this returns false we render a dimmed/locked
 * version of the resource and a "Subscribe / Renew" dialog on click.
 */
import { db } from "@/server/db";

export type ResourceType = "GROUP" | "CHANNEL" | "CHAT" | "COURSE" | "EVENT";

export interface AccessContext {
  userId: string;
  groupId: string;
  resourceType: ResourceType;
  resourceId: string;
}

/**
 * Returns true if the user currently has access to the resource.
 * Checks (in order):
 *  1. Direct MemberAccess row (matching resourceType/resourceId)
 *  2. Group-level MemberAccess (covers all child resources)
 *  3. Active Subscription on the group
 *  4. Membership row without expiry override
 */
export async function hasAccess(ctx: AccessContext): Promise<boolean> {
  const now = new Date();

  // 0. Explicit DENY record on this exact resource → always blocks.
  const denied = await db.memberAccess.findFirst({
    where: {
      userId: ctx.userId,
      resourceType: ctx.resourceType,
      resourceId: ctx.resourceId,
      mode: "DENY",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (denied) return false;

  // 1. Direct GRANT
  const direct = await db.memberAccess.findFirst({
    where: {
      userId: ctx.userId,
      resourceType: ctx.resourceType,
      resourceId: ctx.resourceId,
      mode: "GRANT",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (direct) return true;

  // 2. Group-level GRANT covers all children
  if (ctx.resourceType !== "GROUP") {
    const groupGrant = await db.memberAccess.findFirst({
      where: {
        userId: ctx.userId,
        resourceType: "GROUP",
        resourceId: ctx.groupId,
        mode: "GRANT",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    if (groupGrant) return true;
  }

  // 3. Active Subscription on group
  const sub = await db.subscription.findFirst({
    where: {
      userId: ctx.userId,
      groupId: ctx.groupId,
      status: "ACTIVE",
      currentPeriodEnd: { gt: now },
    },
  });
  if (sub) return true;

  // 4. Membership-level: if there's no expiry set, default-allow.
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: ctx.groupId, userId: ctx.userId } },
  });
  if (!membership || membership.state !== "ACTIVE") return false;

  // Locked? Always deny.
  if (membership.lockedAt) return false;

  // Has explicit expiry?
  if (membership.accessExpiresAt) {
    return membership.accessExpiresAt > now;
  }

  // No expiry set => legacy access granted by default.
  return true;
}

/**
 * Bulk version: returns a map of resourceId -> boolean for the given type.
 * Used by sidebars / lists where we render N items and gate each.
 */
export async function hasAccessBulk(params: {
  userId: string;
  groupId: string;
  resourceType: ResourceType;
  resourceIds: string[];
}): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (params.resourceIds.length === 0) return result;

  const now = new Date();

  // Pull every relevant access record in one go (GRANT or DENY).
  const records = await db.memberAccess.findMany({
    where: {
      userId: params.userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [
        {
          OR: [
            // Direct records on the listed resources
            {
              resourceType: params.resourceType,
              resourceId: { in: params.resourceIds },
            },
            // Group-level record (covers all)
            { resourceType: "GROUP", resourceId: params.groupId },
          ],
        },
      ],
    },
    select: { resourceType: true, resourceId: true, mode: true },
  });

  const directDeny = new Set(
    records
      .filter((r) => r.resourceType === params.resourceType && r.mode === "DENY")
      .map((r) => r.resourceId),
  );
  const directGrant = new Set(
    records
      .filter((r) => r.resourceType === params.resourceType && r.mode === "GRANT")
      .map((r) => r.resourceId),
  );
  const groupGrant = records.some(
    (r) =>
      r.resourceType === "GROUP" &&
      r.resourceId === params.groupId &&
      r.mode === "GRANT",
  );

  // Active subscription?
  const sub = await db.subscription.findFirst({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      status: "ACTIVE",
      currentPeriodEnd: { gt: now },
    },
  });

  // Membership default-allow?
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: params.groupId, userId: params.userId } },
  });
  const membershipDefault =
    !!membership &&
    membership.state === "ACTIVE" &&
    !membership.lockedAt &&
    (!membership.accessExpiresAt || membership.accessExpiresAt > now);

  const blanket = groupGrant || !!sub || membershipDefault;

  for (const id of params.resourceIds) {
    // DENY beats everything (admin can lock specific resources even on
    // members with blanket access).
    if (directDeny.has(id)) {
      result.set(id, false);
      continue;
    }
    if (directGrant.has(id) || blanket) {
      result.set(id, true);
      continue;
    }
    result.set(id, false);
  }
  return result;
}

/**
 * Compute the user's "remaining days" on the group — used by the member self
 * subscription card. Returns null if no active subscription.
 */
export async function remainingDays(params: {
  userId: string;
  groupId: string;
}): Promise<number | null> {
  const now = new Date();
  const sub = await db.subscription.findFirst({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      status: "ACTIVE",
      currentPeriodEnd: { gt: now },
    },
    orderBy: { currentPeriodEnd: "desc" },
  });
  if (!sub) {
    // Maybe a membership-level expiry?
    const m = await db.groupMembership.findUnique({
      where: { groupId_userId: { groupId: params.groupId, userId: params.userId } },
    });
    if (m?.accessExpiresAt && m.accessExpiresAt > now) {
      return Math.ceil((m.accessExpiresAt.getTime() - now.getTime()) / 86400000);
    }
    return null;
  }
  return Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / 86400000);
}
