/**
 * M18: Canonical access resolver.
 *
 * `hasAccess(userId, resourceType, resourceId)` returns true iff:
 *   1. There is a non-expired MemberAccess row for that resource, OR
 *   2. The user has an ACTIVE Subscription on the parent group, OR
 *   3. The resource type is GROUP and the membership has no `accessExpiresAt`
 *      OR `accessExpiresAt > now()` (legacy ungated members stay accessible).
 *
 * M28 Tracks: when the group has `tracksEnabled = true` and the resource
 * is a CHANNEL or COURSE linked to one or more Tracks, the user must also
 * be on a matching track. This is enforced as a final filter AFTER the
 * grant/subscription checks — track gating overrides blanket subscription
 * access (a "premium" subscription doesn't open a channel reserved for the
 * "advanced" cohort).
 *
 * Layered behind UI: when this returns false we render a dimmed/locked
 * version of the resource and a "Subscribe / Renew" dialog on click.
 */
import { db } from "@/server/db";

export type ResourceType =
  | "GROUP"
  | "CHANNEL"
  | "CHAT"
  | "COURSE"
  | "EVENT"
  | "BOOKING_OFFERING";

/**
 * Track-gating predicate. Returns:
 *   • true  — the resource is NOT track-gated, or the user is on a matching track
 *   • false — the resource is track-gated and the user is on no matching track
 *
 * Cheap path: if the group has tracks disabled or the resource has no track
 * links, returns true immediately.
 */
async function passesTrackGate(params: {
  userId: string;
  groupId: string;
  resourceType: ResourceType;
  resourceId: string;
}): Promise<boolean> {
  if (params.resourceType !== "CHANNEL" && params.resourceType !== "COURSE") {
    return true;
  }
  const group = await db.group.findUnique({
    where: { id: params.groupId },
    select: { tracksEnabled: true },
  });
  if (!group || !group.tracksEnabled) return true;

  if (params.resourceType === "CHANNEL") {
    const links = await db.trackChannel.findMany({
      where: { channelId: params.resourceId },
      select: { trackId: true },
    });
    if (links.length === 0) return true; // unlinked = open to all
    const memberOnTrack = await db.trackMember.findFirst({
      where: {
        userId: params.userId,
        groupId: params.groupId,
        trackId: { in: links.map((l) => l.trackId) },
      },
      select: { id: true },
    });
    return !!memberOnTrack;
  }

  // COURSE
  const links = await db.trackCourse.findMany({
    where: { courseId: params.resourceId },
    select: { trackId: true },
  });
  if (links.length === 0) return true;
  const memberOnTrack = await db.trackMember.findFirst({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      trackId: { in: links.map((l) => l.trackId) },
    },
    select: { id: true },
  });
  return !!memberOnTrack;
}

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

  // M28: Track gating runs as a hard filter — even with a blanket grant or
  // active subscription, a track-gated resource is invisible without a
  // matching track membership.
  if (!(await passesTrackGate(ctx))) return false;

  // 1. Direct GRANT (MemberAccess — the canonical record).
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

  // 1b. Legacy per-channel grant (ChannelAccess) — admin-issued grants for
  //     PRIVATE channels still write to this table. Treat as equivalent to
  //     a non-expiring MemberAccess GRANT so all access paths stay unified.
  if (ctx.resourceType === "CHANNEL") {
    const legacy = await db.channelAccess.findFirst({
      where: { userId: ctx.userId, channelId: ctx.resourceId },
      select: { id: true },
    });
    if (legacy) return true;
  }

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

  // (Pre-M31 we used to return true for any active subscription here —
  // that broke the plan-bundle model because Plan A's subscriber would
  // also see Plan B's premium resources. Now access for paid resources
  // flows exclusively through the MemberAccess GRANT rows that
  // syncSubscriptionAccessGrants writes from each plan's PlanResource
  // list. Group-level grants and direct grants handled above already
  // cover the trial case.)

  // 4. Membership-level: if there's no expiry set, default-allow.
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: ctx.groupId, userId: ctx.userId } },
  });
  if (!membership || membership.state !== "ACTIVE") return false;

  // Locked? Always deny.
  if (membership.lockedAt) return false;

  // Has explicit expiry?
  if (membership.accessExpiresAt && membership.accessExpiresAt <= now) {
    return false;
  }

  // Phase 1 monetization: tier-aware default-allow.
  //   • GROUP / FREE channels / FREE courses / FREE events
  //     → membership alone is enough (default-allow).
  //   • PREMIUM resources → require an explicit GRANT (direct or via
  //     group-level free-trial grant). Both already returned early above.
  if (ctx.resourceType === "CHANNEL") {
    const ch = await db.channel.findUnique({
      where: { id: ctx.resourceId },
      select: { tier: true },
    });
    if (ch?.tier === "PREMIUM") return false;
  } else if (ctx.resourceType === "COURSE") {
    const co = await db.course.findUnique({
      where: { id: ctx.resourceId },
      select: { tier: true },
    });
    if (co?.tier === "PREMIUM") return false;
  } else if (ctx.resourceType === "EVENT") {
    const ev = await db.event.findUnique({
      where: { id: ctx.resourceId },
      select: { tier: true },
    });
    if (ev?.tier === "PREMIUM") return false;
  } else if (ctx.resourceType === "BOOKING_OFFERING") {
    const o = await db.bookingOffering.findUnique({
      where: { id: ctx.resourceId },
      select: { tier: true },
    });
    if (o?.tier === "PREMIUM") return false;
  }

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
  // Legacy ChannelAccess rows — fold into directGrant so callers get a
  // single answer per channel regardless of which grant table the admin
  // wrote to.
  if (params.resourceType === "CHANNEL") {
    const legacy = await db.channelAccess.findMany({
      where: {
        userId: params.userId,
        channelId: { in: params.resourceIds },
      },
      select: { channelId: true },
    });
    for (const l of legacy) directGrant.add(l.channelId);
  }
  const groupGrant = records.some(
    (r) =>
      r.resourceType === "GROUP" &&
      r.resourceId === params.groupId &&
      r.mode === "GRANT",
  );

  // Membership default-allow?
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: params.groupId, userId: params.userId } },
  });
  const membershipDefault =
    !!membership &&
    membership.state === "ACTIVE" &&
    !membership.lockedAt &&
    (!membership.accessExpiresAt || membership.accessExpiresAt > now);

  // Only group-level GRANT (free trial / admin GROUP-level grant) confers
  // blanket access. Active subscriptions DON'T — paid access flows through
  // the explicit MemberAccess GRANT rows that syncSubscriptionAccessGrants
  // writes from each plan's PlanResource list, otherwise Plan A would
  // unlock Plan B's premium resources.
  const fullBlanket = groupGrant;

  // Tier lookup for the requested resources. CHANNEL / COURSE / EVENT /
  // BOOKING_OFFERING all carry a `tier` column. Unsupported types are
  // treated as FREE.
  const premiumIds = new Set<string>();
  if (params.resourceType === "CHANNEL") {
    const rows = await db.channel.findMany({
      where: { id: { in: params.resourceIds } },
      select: { id: true, tier: true },
    });
    for (const r of rows) if (r.tier === "PREMIUM") premiumIds.add(r.id);
  } else if (params.resourceType === "COURSE") {
    const rows = await db.course.findMany({
      where: { id: { in: params.resourceIds } },
      select: { id: true, tier: true },
    });
    for (const r of rows) if (r.tier === "PREMIUM") premiumIds.add(r.id);
  } else if (params.resourceType === "EVENT") {
    const rows = await db.event.findMany({
      where: { id: { in: params.resourceIds } },
      select: { id: true, tier: true },
    });
    for (const r of rows) if (r.tier === "PREMIUM") premiumIds.add(r.id);
  } else if (params.resourceType === "BOOKING_OFFERING") {
    const rows = await db.bookingOffering.findMany({
      where: { id: { in: params.resourceIds } },
      select: { id: true, tier: true },
    });
    for (const r of rows) if (r.tier === "PREMIUM") premiumIds.add(r.id);
  }

  // M28: pre-compute the track-gating verdict per resource. For CHANNEL /
  // COURSE we look up TrackChannel / TrackCourse links once and intersect
  // with the user's tracks. Other types pass through unchanged.
  const trackGatedDenied = new Set<string>();
  if (
    (params.resourceType === "CHANNEL" || params.resourceType === "COURSE")
  ) {
    const group = await db.group.findUnique({
      where: { id: params.groupId },
      select: { tracksEnabled: true },
    });
    if (group?.tracksEnabled) {
      const links =
        params.resourceType === "CHANNEL"
          ? await db.trackChannel.findMany({
              where: { channelId: { in: params.resourceIds } },
              select: { channelId: true, trackId: true },
            })
          : await db.trackCourse.findMany({
              where: { courseId: { in: params.resourceIds } },
              select: { courseId: true, trackId: true },
            });
      const linksByResource = new Map<string, Set<string>>();
      for (const link of links) {
        const id =
          "channelId" in link ? link.channelId : link.courseId;
        if (!linksByResource.has(id)) linksByResource.set(id, new Set());
        linksByResource.get(id)!.add(link.trackId);
      }
      const userTracks = await db.trackMember.findMany({
        where: { userId: params.userId, groupId: params.groupId },
        select: { trackId: true },
      });
      const userTrackSet = new Set(userTracks.map((t) => t.trackId));
      for (const id of params.resourceIds) {
        const linkedTracks = linksByResource.get(id);
        if (!linkedTracks || linkedTracks.size === 0) continue; // unlinked = open
        let onAny = false;
        for (const t of linkedTracks) {
          if (userTrackSet.has(t)) {
            onAny = true;
            break;
          }
        }
        if (!onAny) trackGatedDenied.add(id);
      }
    }
  }

  for (const id of params.resourceIds) {
    // DENY beats everything (admin can lock specific resources even on
    // members with blanket access).
    if (directDeny.has(id)) {
      result.set(id, false);
      continue;
    }
    // M28: track gating is a hard filter — overrides grants and subs.
    if (trackGatedDenied.has(id)) {
      result.set(id, false);
      continue;
    }
    if (directGrant.has(id) || fullBlanket) {
      result.set(id, true);
      continue;
    }
    // No explicit grant + no full blanket. Membership default-allow only
    // unlocks FREE-tier resources.
    if (membershipDefault && !premiumIds.has(id)) {
      result.set(id, true);
      continue;
    }
    result.set(id, false);
  }
  return result;
}

/**
 * "Does this user have premium-level access on the group?"
 *
 * Returns true iff one of:
 *   • A non-expired GROUP-level MemberAccess GRANT exists (this is the free
 *     trial mechanism — admin can also grant manually).
 *   • An ACTIVE subscription on the group is present.
 *
 * Used by features that gate the *entire* experience (Events tab, DM send,
 * etc.) on subscription rather than per-resource. Plain ACTIVE membership
 * is NOT enough.
 */
export async function hasGroupSubscriptionAccess(params: {
  userId: string;
  groupId: string;
}): Promise<boolean> {
  const now = new Date();

  const grant = await db.memberAccess.findFirst({
    where: {
      userId: params.userId,
      resourceType: "GROUP",
      resourceId: params.groupId,
      mode: "GRANT",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
  });
  if (grant) return true;

  const sub = await db.subscription.findFirst({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      status: "ACTIVE",
      currentPeriodEnd: { gt: now },
    },
    select: { id: true },
  });
  return !!sub;
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
