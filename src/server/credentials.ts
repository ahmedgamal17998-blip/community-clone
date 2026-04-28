/**
 * Credentials = badges/certificates per course.
 *
 * Two kinds:
 *   • WELCOME    — auto-awarded when the user enrolls in the course
 *   • COMPLETION — auto-awarded when the user has completed every lesson
 *
 * Admins can edit the title / description / image; the `Course` always has
 * exactly two implicit credential slots (WELCOME, COMPLETION). They are
 * created lazily on first reference.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

async function requireCourseAdmin(courseId: string, userId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, groupId: true, group: { select: { slug: true } } },
  });
  if (!course) throw new Error("Course not found");
  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: course.groupId, userId } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    throw new Error("FORBIDDEN");
  }
  return course;
}

// ── Ensure / fetch credential ────────────────────────────────────────────────

export async function ensureCredential(courseId: string, kind: "WELCOME" | "COMPLETION") {
  return db.credential.upsert({
    where: { courseId_kind: { courseId, kind } },
    update: {},
    create: {
      courseId,
      kind,
      title: kind === "WELCOME" ? "Welcome aboard" : "Course complete",
      description:
        kind === "WELCOME"
          ? "Awarded when you enroll in the course."
          : "Awarded when you finish every lesson.",
    },
  });
}

// ── Update credential text/image ─────────────────────────────────────────────

const updateSchema = z.object({
  credentialId: z.string().cuid(),
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
});

export async function updateCredentialAction(input: {
  credentialId: string;
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const c = await db.credential.findUnique({
    where: { id: parsed.data.credentialId },
    select: { id: true, courseId: true },
  });
  if (!c) return { ok: false as const, error: "Credential not found" };

  const course = await requireCourseAdmin(c.courseId, session.user.id);

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.imageUrl !== undefined) data.imageUrl = parsed.data.imageUrl;

  await db.credential.update({ where: { id: c.id }, data });
  revalidatePath(`/groups/${course.group.slug}/learning`, "page");
  return { ok: true as const };
}

// ── Award helpers (called from enrollment / completion flows) ───────────────

export async function awardWelcomeOnEnrollAction(input: {
  userId: string;
  courseId: string;
}) {
  const credential = await ensureCredential(input.courseId, "WELCOME");
  await db.earnedCredential.upsert({
    where: {
      userId_credentialId: {
        userId: input.userId,
        credentialId: credential.id,
      },
    },
    update: {},
    create: { userId: input.userId, credentialId: credential.id },
  });
}

/**
 * Called after a lesson completion. Checks whether the user has completed
 * every lesson in the course; if so, awards the COMPLETION credential.
 */
export async function checkCourseCompletionAction(input: {
  userId: string;
  courseId: string;
}) {
  const [totalLessons, completedLessons] = await Promise.all([
    db.lesson.count({ where: { courseId: input.courseId, published: true } }),
    db.lessonProgress.count({
      where: {
        userId: input.userId,
        courseId: input.courseId,
        completedAt: { not: null },
        lesson: { published: true },
      },
    }),
  ]);

  if (totalLessons === 0 || completedLessons < totalLessons) return;

  const credential = await ensureCredential(input.courseId, "COMPLETION");
  await db.earnedCredential.upsert({
    where: {
      userId_credentialId: {
        userId: input.userId,
        credentialId: credential.id,
      },
    },
    update: {},
    create: { userId: input.userId, credentialId: credential.id },
  });
}
