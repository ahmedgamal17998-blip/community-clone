/**
 * Courses service (M9) — queries + server actions.
 *
 * Read shape:
 *   listCoursesForGroup — published courses (ADMIN+ sees all) with viewer progress %
 *   getCourse          — course + ordered lessons with viewer completion state
 *   getLesson          — lesson + prev/next slugs
 *
 * Mutations (Server Actions):
 *   createCourseAction / updateCourseAction / deleteCourseAction   (ADMIN+)
 *   createLessonAction / updateLessonAction / deleteLessonAction   (ADMIN+)
 *   reorderLessonsAction                                           (ADMIN+)
 *   markLessonCompleteAction / markLessonSeenAction                (ACTIVE member)
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { enforceLimit, incrementUsage, PlanLimitExceeded } from "@/server/billing/limits";
import { hasMinRole, isAtLeast, requireRole, type Role } from "@/server/permissions";
import { addPoints } from "@/server/points";

// ─── Slug helpers ──────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function uniqueCourseSlug(groupId: string, base: string): Promise<string> {
  const root = slugify(base) || "course";
  let candidate = root;
  let i = 2;
  while (
    await db.course.findUnique({
      where: { groupId_slug: { groupId, slug: candidate } },
      select: { id: true },
    })
  ) {
    candidate = `${root}-${i++}`;
    if (i > 50) {
      candidate = `${root}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

async function uniqueLessonSlug(courseId: string, base: string): Promise<string> {
  const root = slugify(base) || "lesson";
  let candidate = root;
  let i = 2;
  while (
    await db.lesson.findUnique({
      where: { courseId_slug: { courseId, slug: candidate } },
      select: { id: true },
    })
  ) {
    candidate = `${root}-${i++}`;
    if (i > 50) {
      candidate = `${root}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

// ─── Read helpers ──────────────────────────────────────────────────────────

export async function listCoursesForGroup(groupId: string, viewerId: string) {
  const member = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: viewerId } },
    select: { role: true, state: true },
  });
  const canSeeUnpublished =
    !!member &&
    member.state === "ACTIVE" &&
    hasMinRole(member.role as Role, "ADMIN");

  const courses = await db.course.findMany({
    where: {
      groupId,
      ...(canSeeUnpublished ? {} : { published: true }),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { lessons: true } },
    },
  });

  const courseIds = courses.map((c) => c.id);
  const progressRows = courseIds.length
    ? await db.lessonProgress.findMany({
        where: {
          userId: viewerId,
          courseId: { in: courseIds },
          completedAt: { not: null },
        },
        select: { courseId: true },
      })
    : [];
  const completedByCourse = new Map<string, number>();
  for (const row of progressRows) {
    completedByCourse.set(row.courseId, (completedByCourse.get(row.courseId) ?? 0) + 1);
  }

  return courses.map((c) => {
    const total = c._count.lessons;
    const done = completedByCourse.get(c.id) ?? 0;
    const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
    return { ...c, progressPercent: percent };
  });
}

export async function getCourse(params: {
  groupId: string;
  slug: string;
  viewerId: string;
}) {
  const course = await db.course.findUnique({
    where: { groupId_slug: { groupId: params.groupId, slug: params.slug } },
    include: {
      lessons: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!course) return null;

  const member = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: params.groupId, userId: params.viewerId } },
    select: { role: true, state: true },
  });
  const isAdmin =
    !!member &&
    member.state === "ACTIVE" &&
    hasMinRole(member.role as Role, "ADMIN");
  if (!course.published && !isAdmin) return null;

  const progress = await db.lessonProgress.findMany({
    where: { userId: params.viewerId, courseId: course.id },
    select: { lessonId: true, completedAt: true },
  });
  const doneMap = new Map<string, boolean>();
  for (const p of progress) doneMap.set(p.lessonId, !!p.completedAt);

  const lessons = course.lessons.map((l) => ({
    ...l,
    completed: doneMap.get(l.id) ?? false,
  }));

  const total = lessons.length;
  const done = lessons.filter((l) => l.completed).length;
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));

  // Next lesson = first not-complete lesson, else first lesson.
  const nextLesson =
    lessons.find((l) => !l.completed) ?? lessons[0] ?? null;

  return { course, lessons, progressPercent: percent, isAdmin, nextLesson };
}

export async function getLesson(params: {
  courseId: string;
  slug: string;
  viewerId: string;
}) {
  const lesson = await db.lesson.findUnique({
    where: { courseId_slug: { courseId: params.courseId, slug: params.slug } },
    include: { course: { select: { id: true, slug: true, groupId: true, published: true } } },
  });
  if (!lesson) return null;

  const siblings = await db.lesson.findMany({
    where: { courseId: params.courseId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, title: true },
  });
  const idx = siblings.findIndex((s) => s.id === lesson.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const progress = await db.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: params.viewerId, lessonId: lesson.id } },
    select: { completedAt: true },
  });

  return {
    lesson,
    siblings,
    prev,
    next,
    completed: !!progress?.completedAt,
  };
}

// ─── Zod schemas for actions ───────────────────────────────────────────────

const createCourseSchema = z.object({
  groupId: z.string().cuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  coverUrl: z.string().trim().url().optional().or(z.literal("")),
  priceType: z.enum(["FREE", "PAID"]).default("FREE"),
  priceLabel: z.string().trim().max(40).optional(),
  priceDollars: z.coerce.number().min(0).max(99999).optional(),
  stripePriceId: z.string().trim().max(100).optional(),
  tier: z.enum(["FREE", "PREMIUM"]).default("FREE"),
  published: z.string().optional(), // "on" | undefined
});

export async function createCourseAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = createCourseSchema.safeParse({
    groupId: formData.get("groupId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    coverUrl: formData.get("coverUrl") || undefined,
    priceType: formData.get("priceType") || "FREE",
    priceLabel: formData.get("priceLabel") || undefined,
    priceDollars: formData.get("priceDollars") || undefined,
    stripePriceId: formData.get("stripePriceId") || undefined,
    tier: formData.get("tier") || "FREE",
    published: formData.get("published") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  const group = await db.group.findUnique({
    where: { id: parsed.data.groupId },
    select: { slug: true, tenantId: true },
  });
  if (!group) throw new Error("Group not found");

  // Enforce course limit
  try {
    await enforceLimit("courses", group.tenantId);
  } catch (e) {
    if (e instanceof PlanLimitExceeded) {
      throw new Error(e.message); // surfaces to the form as an error
    }
    throw e;
  }

  const last = await db.course.findFirst({
    where: { groupId: parsed.data.groupId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const slug = await uniqueCourseSlug(parsed.data.groupId, parsed.data.title);

  const priceAmount =
    parsed.data.priceDollars != null
      ? Math.round(parsed.data.priceDollars * 100)
      : null;

  const course = await db.course.create({
    data: {
      groupId: parsed.data.groupId,
      slug,
      title: parsed.data.title,
      description: parsed.data.description,
      coverUrl: parsed.data.coverUrl || null,
      priceType: parsed.data.priceType,
      priceLabel: parsed.data.priceLabel,
      priceAmount,
      stripePriceId: parsed.data.stripePriceId || null,
      tier: parsed.data.tier,
      published: !!parsed.data.published,
      position,
    },
  });

  await incrementUsage("currentCourses", group.tenantId);
  revalidatePath(`/groups/${group.slug}/learning`);
  redirect(`/groups/${group.slug}/learning/${course.slug}`);
}

const updateCourseSchema = z.object({
  courseId: z.string().cuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  coverUrl: z.string().trim().url().optional().or(z.literal("")),
  priceType: z.enum(["FREE", "PAID"]).default("FREE"),
  priceLabel: z.string().trim().max(40).optional(),
  priceDollars: z.coerce.number().min(0).max(99999).optional(),
  stripePriceId: z.string().trim().max(100).optional(),
  tier: z.enum(["FREE", "PREMIUM"]).default("FREE"),
  published: z.string().optional(),
});

export async function updateCourseAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = updateCourseSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    coverUrl: formData.get("coverUrl") || undefined,
    priceType: formData.get("priceType") || "FREE",
    priceLabel: formData.get("priceLabel") || undefined,
    priceDollars: formData.get("priceDollars") || undefined,
    stripePriceId: formData.get("stripePriceId") || undefined,
    tier: formData.get("tier") || "FREE",
    published: formData.get("published") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const course = await db.course.findUnique({
    where: { id: parsed.data.courseId },
    include: { group: { select: { slug: true } } },
  });
  if (!course) throw new Error("Course not found");

  await requireRole({
    groupId: course.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  const updatePriceAmount =
    parsed.data.priceDollars != null
      ? Math.round(parsed.data.priceDollars * 100)
      : null;

  await db.course.update({
    where: { id: course.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      coverUrl: parsed.data.coverUrl || null,
      priceType: parsed.data.priceType,
      priceLabel: parsed.data.priceLabel,
      priceAmount: updatePriceAmount,
      stripePriceId: parsed.data.stripePriceId || null,
      tier: parsed.data.tier,
      published: !!parsed.data.published,
    },
  });

  revalidatePath(`/groups/${course.group.slug}/learning`);
  revalidatePath(`/groups/${course.group.slug}/learning/${course.slug}`);
  redirect(`/groups/${course.group.slug}/learning/${course.slug}`);
}

/**
 * Toggle the course-level `published` flag without going through the full
 * Edit form. Shown as a one-click button on the course outline header so
 * admins don't lose the toggle behind a Settings menu.
 */
export async function setCoursePublishedAction(params: {
  courseId: string;
  published: boolean;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const course = await db.course.findUnique({
    where: { id: params.courseId },
    include: { group: { select: { slug: true } } },
  });
  if (!course) throw new Error("COURSE_NOT_FOUND");
  await requireRole({
    groupId: course.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.course.update({
    where: { id: course.id },
    data: { published: params.published },
  });
  revalidatePath(`/groups/${course.group.slug}/learning`);
  revalidatePath(`/groups/${course.group.slug}/learning/${course.slug}`);
  revalidatePath(`/groups/${course.group.slug}/learning/${course.slug}/outline`);
}

export async function deleteCourseAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return;

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { group: { select: { slug: true } } },
  });
  if (!course) return;

  await requireRole({ groupId: course.groupId, userId: session.user.id, min: "ADMIN" });

  await db.course.delete({ where: { id: course.id } });
  revalidatePath(`/groups/${course.group.slug}/learning`);
  redirect(`/groups/${course.group.slug}/learning`);
}

// ─── Lesson actions ────────────────────────────────────────────────────────

const createLessonSchema = z.object({
  courseId: z.string().cuid(),
  title: z.string().trim().min(2).max(140),
  body: z.string().trim().max(40000).optional(),
  videoUrl: z.string().trim().url().optional().or(z.literal("")),
  thumbnailUrl: z.string().trim().url().optional().or(z.literal("")),
  resources: z.string().trim().max(20_000).optional().or(z.literal("")),
  durationSec: z.coerce.number().int().min(0).max(60 * 60 * 24).optional(),
});

export async function createLessonAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = createLessonSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    body: formData.get("body") || undefined,
    videoUrl: formData.get("videoUrl") || undefined,
    thumbnailUrl: formData.get("thumbnailUrl") || undefined,
    resources: formData.get("resources") || undefined,
    durationSec: formData.get("durationSec") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const course = await db.course.findUnique({
    where: { id: parsed.data.courseId },
    include: { group: { select: { slug: true } } },
  });
  if (!course) throw new Error("Course not found");

  await requireRole({ groupId: course.groupId, userId: session.user.id, min: "ADMIN" });

  const last = await db.lesson.findFirst({
    where: { courseId: course.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const slug = await uniqueLessonSlug(course.id, parsed.data.title);

  const lesson = await db.lesson.create({
    data: {
      courseId: course.id,
      slug,
      title: parsed.data.title,
      body: parsed.data.body,
      videoUrl: parsed.data.videoUrl || null,
      thumbnailUrl: parsed.data.thumbnailUrl || null,
      resources: parsed.data.resources || null,
      durationSec: parsed.data.durationSec,
      position,
    },
  });

  revalidatePath(`/groups/${course.group.slug}/learning/${course.slug}`);
  redirect(`/groups/${course.group.slug}/learning/${course.slug}/lessons/${lesson.slug}`);
}

const updateLessonSchema = z.object({
  lessonId: z.string().cuid(),
  title: z.string().trim().min(2).max(140),
  body: z.string().trim().max(40000).optional(),
  videoUrl: z.string().trim().url().optional().or(z.literal("")),
  thumbnailUrl: z.string().trim().url().optional().or(z.literal("")),
  resources: z.string().trim().max(20_000).optional().or(z.literal("")),
  durationSec: z.coerce.number().int().min(0).max(60 * 60 * 24).optional(),
});

export async function updateLessonAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = updateLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
    title: formData.get("title"),
    body: formData.get("body") || undefined,
    videoUrl: formData.get("videoUrl") || undefined,
    thumbnailUrl: formData.get("thumbnailUrl") || undefined,
    resources: formData.get("resources") || undefined,
    durationSec: formData.get("durationSec") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const lesson = await db.lesson.findUnique({
    where: { id: parsed.data.lessonId },
    include: { course: { include: { group: { select: { slug: true } } } } },
  });
  if (!lesson) throw new Error("Lesson not found");

  await requireRole({
    groupId: lesson.course.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.lesson.update({
    where: { id: lesson.id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      videoUrl: parsed.data.videoUrl || null,
      thumbnailUrl: parsed.data.thumbnailUrl || null,
      resources: parsed.data.resources || null,
      durationSec: parsed.data.durationSec,
    },
  });

  revalidatePath(
    `/groups/${lesson.course.group.slug}/learning/${lesson.course.slug}/lessons/${lesson.slug}`,
  );
  redirect(
    `/groups/${lesson.course.group.slug}/learning/${lesson.course.slug}/lessons/${lesson.slug}`,
  );
}

export async function deleteLessonAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const lessonId = String(formData.get("lessonId") ?? "");
  if (!lessonId) return;

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { course: { include: { group: { select: { slug: true } } } } },
  });
  if (!lesson) return;

  await requireRole({
    groupId: lesson.course.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.lesson.delete({ where: { id: lesson.id } });
  revalidatePath(`/groups/${lesson.course.group.slug}/learning/${lesson.course.slug}`);
  redirect(`/groups/${lesson.course.group.slug}/learning/${lesson.course.slug}`);
}

const reorderSchema = z.object({
  courseId: z.string().cuid(),
  lessonIds: z.string(), // JSON
});

export async function reorderLessonsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = reorderSchema.safeParse({
    courseId: formData.get("courseId"),
    lessonIds: formData.get("lessonIds"),
  });
  if (!parsed.success) throw new Error("Invalid input");

  const course = await db.course.findUnique({
    where: { id: parsed.data.courseId },
    include: { group: { select: { slug: true } } },
  });
  if (!course) return;

  await requireRole({ groupId: course.groupId, userId: session.user.id, min: "ADMIN" });

  let ids: string[];
  try {
    ids = JSON.parse(parsed.data.lessonIds);
  } catch {
    throw new Error("Invalid lessonIds");
  }
  if (!Array.isArray(ids)) throw new Error("Invalid lessonIds");

  await db.$transaction(
    ids.map((id, index) =>
      db.lesson.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );

  revalidatePath(`/groups/${course.group.slug}/learning/${course.slug}`);
}

// ─── Progress actions ──────────────────────────────────────────────────────

const lessonIdSchema = z.object({ lessonId: z.string().cuid() });

export async function markLessonCompleteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = lessonIdSchema.safeParse({ lessonId: formData.get("lessonId") });
  if (!parsed.success) return;

  const lesson = await db.lesson.findUnique({
    where: { id: parsed.data.lessonId },
    include: { course: { include: { group: { select: { slug: true } } } } },
  });
  if (!lesson) return;

  const ok = await isAtLeast({
    groupId: lesson.course.groupId,
    userId: session.user.id,
    min: "MEMBER",
  });
  if (!ok) throw new Error("FORBIDDEN");

  const now = new Date();
  // Check if this is the first time completing (for points gate).
  const prior = await db.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: session.user.id, lessonId: lesson.id } },
    select: { completedAt: true },
  });
  const isFirstCompletion = !prior?.completedAt;
  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: session.user.id, lessonId: lesson.id } },
    create: {
      userId: session.user.id,
      lessonId: lesson.id,
      courseId: lesson.courseId,
      completedAt: now,
      lastSeenAt: now,
    },
    update: { completedAt: now, lastSeenAt: now },
  });

  if (isFirstCompletion) {
    try {
      await addPoints({
        userId: session.user.id,
        groupId: lesson.course.groupId,
        delta: 5,
        reason: "LESSON_COMPLETED",
        refType: "lesson",
        refId: lesson.id,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("addPoints (lesson) failed", e);
    }

    // Phase 2: auto-award completion certificate if course is now 100% done.
    try {
      const { checkCourseCompletionAction } = await import("@/server/credentials");
      await checkCourseCompletionAction({
        userId: session.user.id,
        courseId: lesson.courseId,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("checkCourseCompletion failed", e);
    }
  }

  // Find next lesson (by position).
  const siblings = await db.lesson.findMany({
    where: { courseId: lesson.courseId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true },
  });
  const idx = siblings.findIndex((s) => s.id === lesson.id);
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const groupSlug = lesson.course.group.slug;
  const courseSlug = lesson.course.slug;
  revalidatePath(`/groups/${groupSlug}/learning/${courseSlug}`);
  revalidatePath(`/groups/${groupSlug}/learning/${courseSlug}/lessons/${lesson.slug}`);

  if (next) {
    redirect(`/groups/${groupSlug}/learning/${courseSlug}/lessons/${next.slug}`);
  } else {
    redirect(`/groups/${groupSlug}/learning/${courseSlug}?done=1`);
  }
}

export async function markLessonSeenAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const parsed = lessonIdSchema.safeParse({ lessonId: formData.get("lessonId") });
  if (!parsed.success) return;

  const lesson = await db.lesson.findUnique({
    where: { id: parsed.data.lessonId },
    select: { id: true, courseId: true, course: { select: { groupId: true } } },
  });
  if (!lesson) return;

  const ok = await isAtLeast({
    groupId: lesson.course.groupId,
    userId: session.user.id,
    min: "MEMBER",
  });
  if (!ok) return;

  const now = new Date();
  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: session.user.id, lessonId: lesson.id } },
    create: {
      userId: session.user.id,
      lessonId: lesson.id,
      courseId: lesson.courseId,
      lastSeenAt: now,
    },
    update: { lastSeenAt: now },
  });
}
