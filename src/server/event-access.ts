/**
 * M23: Event audience-targeting access checks.
 *
 * If event.audienceMode = ALL → everyone in the group sees it.
 * If RESTRICTED → user must match at least one EventAudience row:
 *   ALL         — fallback row (acts like audienceMode=ALL even if RESTRICTED)
 *   CHANNEL     — user has access to the channel
 *   COURSE      — user has access to the course (via canAccessCourse)
 *   ROLE_LEVEL  — user is at least minRole
 *   MEMBER      — explicit user grant
 */
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { canAccessCourse } from "@/server/course-access";

export async function canSeeEvent(params: {
  userId: string;
  eventId: string;
}): Promise<boolean> {
  const event = await db.event.findUnique({
    where: { id: params.eventId },
    include: { audiences: true },
  });
  if (!event) return false;

  // Must be an active group member to even be considered
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
      const channel = await db.channel.findUnique({ where: { id: a.channelId } });
      if (!channel) continue;
      if (channel.kind === "PRIVATE") {
        const access = await db.channelAccess.findUnique({
          where: {
            channelId_userId: {
              channelId: a.channelId,
              userId: params.userId,
            },
          },
        });
        if (access) return true;
      } else {
        // PUBLIC / ANNOUNCEMENT — visible to all active members
        return true;
      }
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
