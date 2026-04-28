/**
 * CourseModule CRUD — Phase 1 of the M9 v2 outline editor.
 *
 * All actions require ADMIN+ on the parent group.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

// ── Shared admin gate ────────────────────────────────────────────────────────

async function requireCourseAdmin(courseId: string, userId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { groupId: true, group: { select: { slug: true } } },
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

// ── Create module ────────────────────────────────────────────────────────────

const createModuleSchema = z.object({
  courseId: z.string().cuid(),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(2000).optional(),
});

export async function createModuleAction(input: {
  courseId: string;
  title: string;
  description?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const parsed = createModuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const course = await requireCourseAdmin(parsed.data.courseId, session.user.id);

  // Append at the end.
  const last = await db.courseModule.findFirst({
    where: { courseId: parsed.data.courseId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const created = await db.courseModule.create({
    data: {
      courseId: parsed.data.courseId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      position,
      releaseMode: "PUBLISHED",
      published: true,
    },
  });

  revalidatePath(`/groups/${course.group.slug}/learning`, "page");
  return { ok: true as const, moduleId: created.id };
}

// ── Update module ────────────────────────────────────────────────────────────

const updateModuleSchema = z.object({
  moduleId: z.string().cuid(),
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  releaseMode: z.enum(["PUBLISHED", "DRIP", "LOCKED"]).optional(),
  dripDays: z.number().int().min(0).max(3650).optional().nullable(),
  published: z.boolean().optional(),
});

export async function updateModuleAction(input: {
  moduleId: string;
  title?: string;
  description?: string | null;
  releaseMode?: "PUBLISHED" | "DRIP" | "LOCKED";
  dripDays?: number | null;
  published?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const parsed = updateModuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const m = await db.courseModule.findUnique({
    where: { id: parsed.data.moduleId },
    select: { courseId: true },
  });
  if (!m) return { ok: false as const, error: "Module not found" };

  const course = await requireCourseAdmin(m.courseId, session.user.id);

  // Strip undefined so we don't overwrite with nulls accidentally.
  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.releaseMode !== undefined) data.releaseMode = parsed.data.releaseMode;
  if (parsed.data.dripDays !== undefined) data.dripDays = parsed.data.dripDays;
  if (parsed.data.published !== undefined) data.published = parsed.data.published;

  await db.courseModule.update({
    where: { id: parsed.data.moduleId },
    data,
  });

  revalidatePath(`/groups/${course.group.slug}/learning`, "page");
  return { ok: true as const };
}

// ── Delete module ────────────────────────────────────────────────────────────

export async function deleteModuleAction(input: { moduleId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const m = await db.courseModule.findUnique({
    where: { id: input.moduleId },
    select: { courseId: true },
  });
  if (!m) return { ok: false as const, error: "Module not found" };

  const course = await requireCourseAdmin(m.courseId, session.user.id);

  // Lessons inside the module become orphans (moduleId set to null) so we
  // don't lose content. Admin can re-attach them or delete them explicitly.
  await db.lesson.updateMany({
    where: { moduleId: input.moduleId },
    data: { moduleId: null },
  });
  await db.courseModule.delete({ where: { id: input.moduleId } });

  revalidatePath(`/groups/${course.group.slug}/learning`, "page");
  return { ok: true as const };
}

// ── Create a lesson inside a module (outline-editor flow) ───────────────────

const createLessonInModuleSchema = z.object({
  moduleId: z.string().cuid(),
  title: z.string().trim().min(1).max(140),
  kind: z.enum(["VIDEO", "TEXT", "QUIZ", "ASSIGNMENT"]).default("VIDEO"),
});

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "lesson";
}

async function uniqueLessonSlug(courseId: string, base: string) {
  const slug = slugify(base);
  let candidate = slug;
  let n = 1;
  while (
    await db.lesson.findUnique({
      where: { courseId_slug: { courseId, slug: candidate } },
      select: { id: true },
    })
  ) {
    n++;
    candidate = `${slug}-${n}`;
  }
  return candidate;
}

export async function createLessonInModuleAction(input: {
  moduleId: string;
  title: string;
  kind?: "VIDEO" | "TEXT" | "QUIZ" | "ASSIGNMENT";
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const parsed = createLessonInModuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const m = await db.courseModule.findUnique({
    where: { id: parsed.data.moduleId },
    select: { courseId: true },
  });
  if (!m) return { ok: false as const, error: "Module not found" };

  const course = await requireCourseAdmin(m.courseId, session.user.id);

  const last = await db.lesson.findFirst({
    where: { moduleId: parsed.data.moduleId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const slug = await uniqueLessonSlug(m.courseId, parsed.data.title);

  const created = await db.lesson.create({
    data: {
      courseId: m.courseId,
      moduleId: parsed.data.moduleId,
      slug,
      title: parsed.data.title,
      kind: parsed.data.kind,
      releaseMode: "PUBLISHED",
      published: false, // start as draft
      position,
    },
  });

  revalidatePath(`/groups/${course.group.slug}/learning`, "page");
  return { ok: true as const, lessonId: created.id, slug: created.slug };
}

// ── Update a lesson's outline meta (release/publish/move) ────────────────────

const updateLessonMetaSchema = z.object({
  lessonId: z.string().cuid(),
  title: z.string().trim().min(1).max(140).optional(),
  releaseMode: z.enum(["PUBLISHED", "DRIP", "LOCKED"]).optional(),
  dripDays: z.number().int().min(0).max(3650).optional().nullable(),
  published: z.boolean().optional(),
  moduleId: z.string().cuid().optional(), // re-parent to a different module
});

export async function updateLessonMetaAction(input: {
  lessonId: string;
  title?: string;
  releaseMode?: "PUBLISHED" | "DRIP" | "LOCKED";
  dripDays?: number | null;
  published?: boolean;
  moduleId?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const parsed = updateLessonMetaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const lesson = await db.lesson.findUnique({
    where: { id: parsed.data.lessonId },
    select: { id: true, courseId: true },
  });
  if (!lesson) return { ok: false as const, error: "Lesson not found" };

  const course = await requireCourseAdmin(lesson.courseId, session.user.id);

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.releaseMode !== undefined) data.releaseMode = parsed.data.releaseMode;
  if (parsed.data.dripDays !== undefined) data.dripDays = parsed.data.dripDays;
  if (parsed.data.published !== undefined) data.published = parsed.data.published;
  if (parsed.data.moduleId !== undefined) {
    // Verify the target module is in the same course.
    const target = await db.courseModule.findUnique({
      where: { id: parsed.data.moduleId },
      select: { courseId: true },
    });
    if (!target || target.courseId !== lesson.courseId) {
      return { ok: false as const, error: "Module not in this course" };
    }
    data.moduleId = parsed.data.moduleId;
  }

  await db.lesson.update({
    where: { id: lesson.id },
    data,
  });

  revalidatePath(`/groups/${course.group.slug}/learning`, "page");
  return { ok: true as const };
}

// ── Reorder modules ──────────────────────────────────────────────────────────

export async function reorderModulesAction(input: {
  courseId: string;
  orderedIds: string[]; // module IDs in the new order
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const course = await requireCourseAdmin(input.courseId, session.user.id);

  // Verify all IDs belong to this course.
  const modules = await db.courseModule.findMany({
    where: { id: { in: input.orderedIds }, courseId: input.courseId },
    select: { id: true },
  });
  if (modules.length !== input.orderedIds.length) {
    return { ok: false as const, error: "Module mismatch" };
  }

  await db.$transaction(
    input.orderedIds.map((id, position) =>
      db.courseModule.update({
        where: { id },
        data: { position },
      }),
    ),
  );

  revalidatePath(`/groups/${course.group.slug}/learning`, "page");
  return { ok: true as const };
}
