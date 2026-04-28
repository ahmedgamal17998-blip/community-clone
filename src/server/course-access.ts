/**
 * M22: Course access rules.
 *
 * Multiple rules combine OR-wise: if ANY rule matches, the user gets in.
 * Rule types:
 *   CHANNEL    — user must be ChannelAccess member of `channelId`
 *   ROLE_LEVEL — user must be at least `minRole` in the group
 *   TENURE     — user must have `tenureDays` of cumulative active subscription
 *                (or membership age if no subs exist)
 *   PAID       — user must have CourseEnrollment row OR a CourseManualGrant
 *   MANUAL     — user must have a CourseManualGrant
 *
 * Existing CourseEnrollment continues to grant access for legacy course flows.
 */
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

export async function canAccessCourse(params: {
  userId: string;
  courseId: string;
}): Promise<boolean> {
  const course = await db.course.findUnique({
    where: { id: params.courseId },
    include: { accessRules: true },
  });
  if (!course) return false;

  // Existing M16 enrollment shortcut
  const enrollment = await db.courseEnrollment.findFirst({
    where: {
      userId: params.userId,
      courseId: params.courseId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (enrollment) return true;

  // Manual grant?
  const manual = await db.courseManualGrant.findUnique({
    where: { courseId_userId: { courseId: params.courseId, userId: params.userId } },
  });
  if (manual) return true;

  // No rules + FREE = open
  if (course.accessRules.length === 0 && course.priceType === "FREE") return true;

  // Membership for ROLE_LEVEL/TENURE checks
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: course.groupId, userId: params.userId } },
  });

  for (const rule of course.accessRules) {
    if (rule.type === "CHANNEL" && rule.channelId) {
      const access = await db.channelAccess.findUnique({
        where: {
          channelId_userId: { channelId: rule.channelId, userId: params.userId },
        },
      });
      if (access) return true;
      // PUBLIC channel + active membership counts too
      const channel = await db.channel.findUnique({
        where: { id: rule.channelId },
      });
      if (
        channel &&
        channel.kind !== "PRIVATE" &&
        membership &&
        membership.state === "ACTIVE"
      ) {
        return true;
      }
    }

    if (
      rule.type === "ROLE_LEVEL" &&
      rule.minRole &&
      membership &&
      membership.state === "ACTIVE" &&
      hasMinRole(membership.role as Role, rule.minRole as Role)
    ) {
      return true;
    }

    if (rule.type === "TENURE" && rule.tenureDays && membership) {
      const days = await tenureDays({
        userId: params.userId,
        groupId: course.groupId,
        joinedAt: membership.joinedAt,
      });
      if (days >= rule.tenureDays) return true;
    }

    // PAID + MANUAL handled above (manual grant short-circuit), or via
    // the in-house payment system creating a CourseEnrollment.
  }

  return false;
}

/**
 * Compute "active tenure" days. Sums Subscription periods (start → end clamped
 * to now), falls back to membership age when no subscriptions exist.
 */
export async function tenureDays(params: {
  userId: string;
  groupId: string;
  joinedAt: Date;
}): Promise<number> {
  const subs = await db.subscription.findMany({
    where: { userId: params.userId, groupId: params.groupId },
    select: { startedAt: true, currentPeriodEnd: true, status: true },
  });

  if (subs.length === 0) {
    const ms = Date.now() - params.joinedAt.getTime();
    return Math.floor(ms / 86400000);
  }

  const now = Date.now();
  let totalMs = 0;
  for (const s of subs) {
    const end = Math.min(s.currentPeriodEnd.getTime(), now);
    if (end > s.startedAt.getTime()) {
      totalMs += end - s.startedAt.getTime();
    }
  }
  return Math.floor(totalMs / 86400000);
}

export async function canAccessCourseBulk(params: {
  userId: string;
  courseIds: string[];
}): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  for (const id of params.courseIds) {
    result.set(id, await canAccessCourse({ userId: params.userId, courseId: id }));
  }
  return result;
}
