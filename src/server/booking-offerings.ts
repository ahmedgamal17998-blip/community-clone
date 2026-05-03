/**
 * M31 — Booking offerings (Booky integration).
 *
 * Read helpers + access state for booking offerings. Mirrors the same
 * tier/visibility model channels and events use, so the same `hasAccess`
 * resolver decides who sees what.
 *
 * Server-only — actions live in src/server/actions/booking-offerings.ts.
 */
import "server-only";
import { db } from "@/server/db";
import { hasAccessBulk } from "@/server/access";
import { hasMinRole } from "@/server/permissions";

export type OfferingAccessState = "ACCESS" | "LOCKED" | "HIDDEN";

/**
 * Returns the booking offerings the viewer can render (excluding HIDDEN
 * ones they have no access to) along with each one's access state.
 *
 * Admins always get ACCESS for everything they manage.
 */
export async function listOfferingsForViewer(params: {
  groupId: string;
  userId: string;
}): Promise<
  Array<{
    id: string;
    label: string;
    tooltipText: string | null;
    instructorSlug: string;
    eventSlug: string;
    tier: string;
    visibility: string;
    state: OfferingAccessState;
  }>
> {
  const offerings = await db.bookingOffering.findMany({
    where: { groupId: params.groupId, archived: false },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      tooltipText: true,
      instructorSlug: true,
      eventSlug: true,
      tier: true,
      visibility: true,
    },
  });
  if (offerings.length === 0) return [];

  // Determine admin status once.
  const me = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: params.groupId, userId: params.userId },
    },
    select: { role: true, state: true },
  });
  const isActive = me?.state === "ACTIVE";
  const isAdmin =
    isActive &&
    hasMinRole(me!.role as Parameters<typeof hasMinRole>[0], "ADMIN");

  // Admins see everything.
  if (isAdmin) {
    return offerings.map((o) => ({ ...o, state: "ACCESS" as const }));
  }

  // Non-active viewers (shouldn't normally hit this — page guards) see only
  // free non-hidden offerings to be safe.
  if (!isActive) {
    return offerings
      .filter((o) => o.tier !== "PREMIUM")
      .map((o) => ({ ...o, state: "ACCESS" as const }));
  }

  // For premium offerings, bulk-resolve access via the unified resolver.
  const premiumIds = offerings
    .filter((o) => o.tier === "PREMIUM")
    .map((o) => o.id);
  const accessMap =
    premiumIds.length > 0
      ? await hasAccessBulk({
          userId: params.userId,
          groupId: params.groupId,
          resourceType: "BOOKING_OFFERING",
          resourceIds: premiumIds,
        })
      : new Map<string, boolean>();

  const result: Array<{
    id: string;
    label: string;
    tooltipText: string | null;
    instructorSlug: string;
    eventSlug: string;
    tier: string;
    visibility: string;
    state: OfferingAccessState;
  }> = [];
  for (const o of offerings) {
    if (o.tier !== "PREMIUM") {
      result.push({ ...o, state: "ACCESS" });
      continue;
    }
    if (accessMap.get(o.id)) {
      result.push({ ...o, state: "ACCESS" });
      continue;
    }
    if (o.visibility === "HIDDEN") continue; // drop entirely
    result.push({ ...o, state: "LOCKED" });
  }
  return result;
}

/**
 * Single-offering access check — used by the SSO endpoint to decide
 * whether to mark `planAccess: true` in the token.
 */
export async function canBookOffering(params: {
  userId: string;
  groupId: string;
  offeringId: string;
}): Promise<boolean> {
  const offering = await db.bookingOffering.findUnique({
    where: { id: params.offeringId },
    select: {
      id: true,
      groupId: true,
      tier: true,
      archived: true,
    },
  });
  if (!offering || offering.groupId !== params.groupId || offering.archived) {
    return false;
  }
  const me = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: params.groupId, userId: params.userId },
    },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE") return false;

  if (
    hasMinRole(me.role as Parameters<typeof hasMinRole>[0], "ADMIN")
  ) {
    return true;
  }
  if (offering.tier !== "PREMIUM") return true;

  const map = await hasAccessBulk({
    userId: params.userId,
    groupId: params.groupId,
    resourceType: "BOOKING_OFFERING",
    resourceIds: [params.offeringId],
  });
  return map.get(params.offeringId) === true;
}
