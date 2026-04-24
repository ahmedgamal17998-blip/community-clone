/**
 * Enrollment helpers (M16).
 *
 * isEnrolled            — FREE course OR active enrollment row
 * getEnrollment         — returns enrollment row or null
 * createFreeEnrollmentAction  — enroll in a FREE course directly (no Stripe)
 * cancelEnrollmentAction      — mark enrollment CANCELLED (self or ADMIN+)
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

// ─── Read helpers ──────────────────────────────────────────────────────────

export async function isEnrolled({
  userId,
  courseId,
}: {
  userId: string;
  courseId: string;
}): Promise<boolean> {
  // Check if the course is FREE first — free courses are always accessible.
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { priceType: true },
  });
  if (!course) return false;
  if (course.priceType === "FREE") return true;

  // PAID course — check for active enrollment row.
  const enrollment = await db.courseEnrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { status: true },
  });
  return enrollment?.status === "ACTIVE";
}

export async function getEnrollment({
  userId,
  courseId,
}: {
  userId: string;
  courseId: string;
}) {
  return db.courseEnrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
}

// ─── Free enrollment ───────────────────────────────────────────────────────

export async function createFreeEnrollmentAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthenticated" };

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { ok: false, error: "missing_course_id" };

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { group: { select: { slug: true } } },
  });
  if (!course) return { ok: false, error: "course_not_found" };
  if (course.priceType !== "FREE") return { ok: false, error: "not_a_free_course" };

  // Require active membership.
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: course.groupId, userId: session.user.id } },
    select: { state: true },
  });
  if (!membership || membership.state !== "ACTIVE") {
    return { ok: false, error: "not_a_member" };
  }

  // Upsert — idempotent.
  await db.courseEnrollment.upsert({
    where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
    create: {
      userId: session.user.id,
      courseId: course.id,
      groupId: course.groupId,
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });

  revalidatePath(`/groups/${course.group.slug}/learning/${course.slug}`);
  return { ok: true };
}

// ─── Cancel enrollment ─────────────────────────────────────────────────────

export async function cancelEnrollmentAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthenticated" };

  const enrollmentId = String(formData.get("enrollmentId") ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "missing_enrollment_id" };

  const enrollment = await db.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: { include: { group: { select: { slug: true } } } } },
  });
  if (!enrollment) return { ok: false, error: "enrollment_not_found" };

  const isSelf = enrollment.userId === session.user.id;

  if (!isSelf) {
    // Must be ADMIN+ in the group.
    const adminMembership = await db.groupMembership.findUnique({
      where: {
        groupId_userId: { groupId: enrollment.groupId, userId: session.user.id },
      },
      select: { role: true, state: true },
    });
    if (
      !adminMembership ||
      adminMembership.state !== "ACTIVE" ||
      !hasMinRole(adminMembership.role as Role, "ADMIN")
    ) {
      return { ok: false, error: "forbidden" };
    }
  }

  await db.courseEnrollment.update({
    where: { id: enrollmentId },
    data: { status: "CANCELLED" },
  });

  revalidatePath(
    `/groups/${enrollment.course.group.slug}/learning/${enrollment.course.slug}`,
  );
  return { ok: true };
}
