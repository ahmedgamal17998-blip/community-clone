/**
 * Quiz CRUD + submission.
 *
 * Admin actions (require ADMIN+ in the parent group):
 *   - upsertQuizAction(lessonId, settings)
 *   - addQuestionAction(quizId, text, type)
 *   - updateQuestionAction(questionId, text, type)
 *   - deleteQuestionAction(questionId)
 *   - addOptionAction(questionId, text, isCorrect)
 *   - updateOptionAction(optionId, text, isCorrect)
 *   - deleteOptionAction(optionId)
 *
 * Member action:
 *   - submitQuizAttemptAction(quizId, answers) — auto-grades; if passed,
 *     marks the lesson as completed (LessonProgress.completedAt).
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

// ── Shared admin gate ────────────────────────────────────────────────────────

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

async function requireQuizAdmin(quizId: string, userId: string) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, lessonId: true },
  });
  if (!quiz) throw new Error("Quiz not found");
  const lesson = await requireLessonAdmin(quiz.lessonId, userId);
  return { quiz, lesson };
}

// ── Upsert quiz settings ────────────────────────────────────────────────────

const upsertQuizSchema = z.object({
  lessonId: z.string().cuid(),
  passingScore: z.number().int().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().optional(),
  allowRetake: z.boolean().optional(),
});

export async function upsertQuizAction(input: {
  lessonId: string;
  passingScore?: number;
  shuffleQuestions?: boolean;
  allowRetake?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = upsertQuizSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const lesson = await requireLessonAdmin(parsed.data.lessonId, session.user.id);

  const data = {
    passingScore: parsed.data.passingScore ?? 70,
    shuffleQuestions: parsed.data.shuffleQuestions ?? false,
    allowRetake: parsed.data.allowRetake ?? true,
  };

  const quiz = await db.quiz.upsert({
    where: { lessonId: parsed.data.lessonId },
    update: data,
    create: { lessonId: parsed.data.lessonId, ...data },
  });

  revalidatePath(`/groups/${lesson.course.group.slug}/learning`, "page");
  return { ok: true as const, quizId: quiz.id };
}

// ── Question CRUD ────────────────────────────────────────────────────────────

export async function addQuestionAction(input: {
  quizId: string;
  text: string;
  type?: "SINGLE" | "MULTIPLE";
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const { lesson } = await requireQuizAdmin(input.quizId, session.user.id);

  const last = await db.quizQuestion.findFirst({
    where: { quizId: input.quizId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;

  const created = await db.quizQuestion.create({
    data: {
      quizId: input.quizId,
      text: input.text.trim(),
      type: input.type ?? "SINGLE",
      order,
    },
  });

  revalidatePath(`/groups/${lesson.course.group.slug}/learning`, "page");
  return { ok: true as const, questionId: created.id };
}

export async function updateQuestionAction(input: {
  questionId: string;
  text?: string;
  type?: "SINGLE" | "MULTIPLE";
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const q = await db.quizQuestion.findUnique({
    where: { id: input.questionId },
    select: { quizId: true },
  });
  if (!q) return { ok: false as const, error: "Question not found" };
  await requireQuizAdmin(q.quizId, session.user.id);

  const data: Record<string, unknown> = {};
  if (input.text !== undefined) data.text = input.text.trim();
  if (input.type !== undefined) data.type = input.type;

  await db.quizQuestion.update({ where: { id: input.questionId }, data });
  return { ok: true as const };
}

export async function deleteQuestionAction(input: { questionId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const q = await db.quizQuestion.findUnique({
    where: { id: input.questionId },
    select: { quizId: true },
  });
  if (!q) return { ok: false as const, error: "Question not found" };
  await requireQuizAdmin(q.quizId, session.user.id);

  await db.quizQuestion.delete({ where: { id: input.questionId } });
  return { ok: true as const };
}

// ── Option CRUD ──────────────────────────────────────────────────────────────

export async function addOptionAction(input: {
  questionId: string;
  text: string;
  isCorrect?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const q = await db.quizQuestion.findUnique({
    where: { id: input.questionId },
    select: { quizId: true },
  });
  if (!q) return { ok: false as const, error: "Question not found" };
  await requireQuizAdmin(q.quizId, session.user.id);

  const last = await db.quizOption.findFirst({
    where: { questionId: input.questionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;

  const created = await db.quizOption.create({
    data: {
      questionId: input.questionId,
      text: input.text.trim(),
      isCorrect: input.isCorrect ?? false,
      order,
    },
  });

  return { ok: true as const, optionId: created.id };
}

export async function updateOptionAction(input: {
  optionId: string;
  text?: string;
  isCorrect?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const o = await db.quizOption.findUnique({
    where: { id: input.optionId },
    select: { question: { select: { quizId: true } } },
  });
  if (!o) return { ok: false as const, error: "Option not found" };
  await requireQuizAdmin(o.question.quizId, session.user.id);

  const data: Record<string, unknown> = {};
  if (input.text !== undefined) data.text = input.text.trim();
  if (input.isCorrect !== undefined) data.isCorrect = input.isCorrect;

  await db.quizOption.update({ where: { id: input.optionId }, data });
  return { ok: true as const };
}

export async function deleteOptionAction(input: { optionId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const o = await db.quizOption.findUnique({
    where: { id: input.optionId },
    select: { question: { select: { quizId: true } } },
  });
  if (!o) return { ok: false as const, error: "Option not found" };
  await requireQuizAdmin(o.question.quizId, session.user.id);

  await db.quizOption.delete({ where: { id: input.optionId } });
  return { ok: true as const };
}

// ── Submit attempt (member) ──────────────────────────────────────────────────

const submitSchema = z.object({
  quizId: z.string().cuid(),
  // { questionId: optionId | optionId[] } — JSON-friendly
  answers: z.record(z.union([z.string(), z.array(z.string())])),
});

export async function submitQuizAttemptAction(input: {
  quizId: string;
  answers: Record<string, string | string[]>;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const quiz = await db.quiz.findUnique({
    where: { id: parsed.data.quizId },
    include: {
      lesson: { select: { id: true, courseId: true } },
      questions: { include: { options: true } },
    },
  });
  if (!quiz) return { ok: false as const, error: "Quiz not found" };

  // Grade
  let correct = 0;
  for (const q of quiz.questions) {
    const submitted = parsed.data.answers[q.id];
    if (!submitted) continue;
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id).sort();
    const submittedIds = Array.isArray(submitted)
      ? [...submitted].sort()
      : [submitted];
    if (
      submittedIds.length === correctIds.length &&
      submittedIds.every((id, i) => id === correctIds[i])
    ) {
      correct++;
    }
  }

  const total = quiz.questions.length;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  const passed = percent >= quiz.passingScore;

  // Persist attempt
  const attempt = await db.quizAttempt.create({
    data: {
      userId: session.user.id,
      quizId: quiz.id,
      score: correct,
      total,
      passed,
      answersJson: JSON.stringify(parsed.data.answers),
    },
  });

  // Mark lesson complete on pass.
  if (passed) {
    await db.lessonProgress.upsert({
      where: { userId_lessonId: { userId: session.user.id, lessonId: quiz.lessonId } },
      update: { completedAt: new Date() },
      create: {
        userId: session.user.id,
        lessonId: quiz.lessonId,
        courseId: quiz.lesson.courseId,
        completedAt: new Date(),
      },
    });

    // Trigger completion-check (auto-award certificate if 100% done).
    try {
      const { checkCourseCompletionAction } = await import("@/server/credentials");
      await checkCourseCompletionAction({
        userId: session.user.id,
        courseId: quiz.lesson.courseId,
      });
    } catch {
      /* best-effort */
    }
  }

  return {
    ok: true as const,
    attemptId: attempt.id,
    score: correct,
    total,
    percent,
    passed,
    passingScore: quiz.passingScore,
  };
}
