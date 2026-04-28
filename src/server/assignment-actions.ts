/**
 * Assignment CRUD + member submission + admin grading.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

async function requireLessonAdmin(lessonId: string, userId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      courseId: true,
      course: {
        select: { groupId: true, slug: true, group: { select: { slug: true } } },
      },
    },
  });
  if (!lesson) throw new Error("Lesson not found");
  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: lesson.course.groupId, userId } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    throw new Error("FORBIDDEN");
  }
  return lesson;
}

// ── Upsert assignment settings ──────────────────────────────────────────────

const upsertSchema = z.object({
  lessonId: z.string().cuid(),
  instructions: z.string().trim().max(20_000).optional().nullable(),
  submissionType: z.enum(["TEXT", "FILE", "BOTH"]).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
});

export async function upsertAssignmentAction(input: {
  lessonId: string;
  instructions?: string | null;
  submissionType?: "TEXT" | "FILE" | "BOTH";
  maxScore?: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const lesson = await requireLessonAdmin(parsed.data.lessonId, session.user.id);

  const data = {
    instructions: parsed.data.instructions ?? null,
    submissionType: parsed.data.submissionType ?? "TEXT",
    maxScore: parsed.data.maxScore ?? 100,
  };

  const a = await db.assignment.upsert({
    where: { lessonId: parsed.data.lessonId },
    update: data,
    create: { lessonId: parsed.data.lessonId, ...data },
  });

  revalidatePath(`/groups/${lesson.course.group.slug}/learning`, "page");
  return { ok: true as const, assignmentId: a.id };
}

// ── Submit (member) ─────────────────────────────────────────────────────────

const submitSchema = z.object({
  assignmentId: z.string().cuid(),
  textAnswer: z.string().trim().max(50_000).optional().nullable(),
  fileUrl: z.string().url().optional().nullable(),
});

export async function submitAssignmentAction(input: {
  assignmentId: string;
  textAnswer?: string | null;
  fileUrl?: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const a = await db.assignment.findUnique({
    where: { id: parsed.data.assignmentId },
    select: { id: true, lessonId: true, lesson: { select: { courseId: true } } },
  });
  if (!a) return { ok: false as const, error: "Assignment not found" };

  const sub = await db.assignmentSubmission.upsert({
    where: {
      userId_assignmentId: {
        userId: session.user.id,
        assignmentId: a.id,
      },
    },
    update: {
      textAnswer: parsed.data.textAnswer ?? null,
      fileUrl: parsed.data.fileUrl ?? null,
      submittedAt: new Date(),
      // Re-grading needed if the member resubmits.
      score: null,
      gradedAt: null,
      gradedById: null,
      feedback: null,
    },
    create: {
      userId: session.user.id,
      assignmentId: a.id,
      textAnswer: parsed.data.textAnswer ?? null,
      fileUrl: parsed.data.fileUrl ?? null,
    },
  });

  return { ok: true as const, submissionId: sub.id };
}

// ── Grade (admin) ────────────────────────────────────────────────────────────

const gradeSchema = z.object({
  submissionId: z.string().cuid(),
  score: z.number().int().min(0).max(1000),
  feedback: z.string().trim().max(20_000).optional().nullable(),
});

export async function gradeAssignmentAction(input: {
  submissionId: string;
  score: number;
  feedback?: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = gradeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const sub = await db.assignmentSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    select: {
      id: true,
      userId: true,
      assignment: {
        select: { lessonId: true, lesson: { select: { courseId: true } } },
      },
    },
  });
  if (!sub) return { ok: false as const, error: "Submission not found" };

  await requireLessonAdmin(sub.assignment.lessonId, session.user.id);

  await db.assignmentSubmission.update({
    where: { id: sub.id },
    data: {
      score: parsed.data.score,
      feedback: parsed.data.feedback ?? null,
      gradedAt: new Date(),
      gradedById: session.user.id,
    },
  });

  // Mark lesson complete (any grade counts as completion).
  await db.lessonProgress.upsert({
    where: {
      userId_lessonId: {
        userId: sub.userId,
        lessonId: sub.assignment.lessonId,
      },
    },
    update: { completedAt: new Date() },
    create: {
      userId: sub.userId,
      lessonId: sub.assignment.lessonId,
      courseId: sub.assignment.lesson.courseId,
      completedAt: new Date(),
    },
  });

  // Auto-award completion certificate if course is now 100% done.
  try {
    const { checkCourseCompletionAction } = await import("@/server/credentials");
    await checkCourseCompletionAction({
      userId: sub.userId,
      courseId: sub.assignment.lesson.courseId,
    });
  } catch {
    /* best-effort */
  }

  return { ok: true as const };
}
