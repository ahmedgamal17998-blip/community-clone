/**
 * Event access — layered check.
 *
 * Three layers determine whether an event shows up in the calendar:
 *
 *   1. AUDIENCE (M23) — `canPassAudience()`
 *      audienceMode=ALL → everyone passes
 *      audienceMode=RESTRICTED → user must match at least one EventAudience row
 *      (CHANNEL / COURSE / ROLE_LEVEL / MEMBER / ALL).
 *
 *   2. TIER (M30 plan-gating) — runs only after audience passes.
 *      tier=FREE → access granted
 *      tier=PREMIUM → user must have hasAccess(EVENT, eventId), which honors
 *      MemberAccess GRANTs (from Plans / trial / manual) and active subs.
 *
 *   3. VISIBILITY (M30 — same model as channels) — applies when audience
 *      passes but tier check fails:
 *        LOCKED_VISIBLE → event still appears, dimmed, paywall on click
 *        HIDDEN         → event is dropped entirely
 *
 * Admins/Owners always pass all three layers — the calendar shows them
 * everything they manage.
 */
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { canAccessCourse } from "@/server/course-access";
import { hasAccess, hasAccessBulk } from "@/server/access";

export type EventAccessState = "ACCESS" | "LOCKED" | "HIDDEN";

/**
 * Per-event audience check (M23). Pure boolean — does NOT account for tier.
 */
export async function canPassAudience(params: {
  userId: string;
  eventId: string;
}): Promise<boolean> {
  const event = await db.event.findUnique({
    where: { id: params.eventId },
    include: { audiences: true },
  });
  if (!event) return false;

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: event.groupId, userId: params.userId } },
  });
  if (!membership || membership.state !== "ACTIVE") return false;

  if (event.audienceMode === "ALL") return true;
  if (event.audiences.length === 0) return true; // RESTRICTED but no rules = open (legacy)

  for (const a of event.audiences) {
    if (a.type === "ALL") return true;
    if (a.type === "MEMBER" && a.userId === params.userId) return true;

    if (
      a.type === "ROLE_LEVEL" &&
      a.minRole &&
      hasMinRole(membership.role as Role, a.minRole as Role)
    )
      return true;

    if (a.type === "CHANNEL" && a.channelId) {
      const channel = await db.channel.findUnique({
        where: { id: a.channelId },
        select: { groupId: true },
      });
      if (!channel) continue;
      const allowed = await hasAccess({
        userId: params.userId,
        groupId: channel.groupId,
        resourceType: "CHANNEL",
        resourceId: a.channelId,
      });
      if (allowed) return true;
    }

    if (a.type === "COURSE" && a.courseId) {
      const ok = await canAccessCourse({
        userId: params.userId,
        courseId: a.courseId,
      });
      if (ok) return true;
    }
  }

  return false;
}

/**
 * Legacy API — strictly "should the calendar show this event row to the user?"
 * Now means audience pass AND (tier=FREE OR plan grants access OR visibility
 * is LOCKED_VISIBLE so a dimmed entry is still rendered).
 */
export async function canSeeEvent(params: {
  userId: string;
  eventId: string;
}): Promise<boolean> {
  if (!(await canPassAudience(params))) return false;
  const event = await db.event.findUnique({
    where: { id: params.eventId },
    select: { groupId: true, tier: true, visibility: true },
  });
  if (!event) return false;
  if (event.tier !== "PREMIUM") return true;

  const allowed = await hasAccess({
    userId: params.userId,
    groupId: event.groupId,
    resourceType: "EVENT",
    resourceId: params.eventId,
  });
  if (allowed) return true;
  // No access — hidden events drop, locked-visible ones still render dimmed.
  return event.visibility !== "HIDDEN";
}

/**
 * Bulk version: for a set of event IDs in one group, return a map
 * eventId → EventAccessState. Admins always get ACCESS.
 *
 * Two database calls in total, regardless of how many events.
 */
export async function eventAccessStates(params: {
  userId: string;
  groupId: string;
  eventIds: string[];
  isAdmin?: boolean;
}): Promise<Map<string, EventAccessState>> {
  const result = new Map<string, EventAccessState>();
  if (params.eventIds.length === 0) return result;

  if (params.isAdmin) {
    for (const id of params.eventIds) result.set(id, "ACCESS");
    return result;
  }

  const events = await db.event.findMany({
    where: { id: { in: params.eventIds } },
    select: { id: true, tier: true, visibility: true },
  });

  // Tier=FREE events: instant ACCESS. Premium events: bulk hasAccess to
  // figure out per-event state.
  const premiumIds = events
    .filter((e) => e.tier === "PREMIUM")
    .map((e) => e.id);
  const premiumAccess =
    premiumIds.length > 0
      ? await hasAccessBulk({
          userId: params.userId,
          groupId: params.groupId,
          resourceType: "EVENT",
          resourceIds: premiumIds,
        })
      : new Map<string, boolean>();

  for (const e of events) {
    if (e.tier !== "PREMIUM") {
      result.set(e.id, "ACCESS");
      continue;
    }
    if (premiumAccess.get(e.id)) {
      result.set(e.id, "ACCESS");
      continue;
    }
    result.set(e.id, e.visibility === "HIDDEN" ? "HIDDEN" : "LOCKED");
  }
  return result;
}

/**
 * IDs of events the calendar should render at all (excludes HIDDEN ones
 * the user has no access to, and audience-failures). Use the access state
 * map from `eventAccessStates` to decide rendering for the surviving ones.
 */
export async function eligibleEventsForUser(params: {
  userId: string;
  groupId: string;
}): Promise<string[]> {
  const events = await db.event.findMany({
    where: { groupId: params.groupId },
    select: { id: true },
  });
  const ok: string[] = [];
  for (const e of events) {
    if (await canSeeEvent({ userId: params.userId, eventId: e.id })) {
      ok.push(e.id);
    }
  }
  return ok;
}
