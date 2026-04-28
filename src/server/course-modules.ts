/**
 * Course module / lesson hierarchy + drip/lock evaluator.
 *
 * Every course has 1+ Modules; every Module has 1+ Lessons. Both Modules
 * and Lessons carry a release mode:
 *   • PUBLISHED → available immediately (when the user has course access)
 *   • DRIP      → available `dripDays` after the user enrolled
 *   • LOCKED    → available only after every previous lesson/module is done
 *
 * `getCourseOutline()` returns the full hierarchy with per-row "release"
 * info so the player + editor can render lock badges and "available in Nd".
 */
import { db } from "@/server/db";

// ── Types ────────────────────────────────────────────────────────────────────

export type ModuleRow = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  releaseMode: string;
  dripDays: number | null;
  published: boolean;
  release: ReleaseState;
  lessons: LessonRow[];
};

export type LessonRow = {
  id: string;
  moduleId: string | null;
  slug: string;
  title: string;
  body: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  kind: string;
  releaseMode: string;
  dripDays: number | null;
  resources: string | null;
  published: boolean;
  position: number;
  completed: boolean;
  release: ReleaseState;
};

export type ReleaseState =
  | { state: "available" }
  | { state: "drip"; daysRemaining: number; unlocksAt: Date }
  | { state: "locked"; reason: "previous-incomplete" | "unpublished" };

// ── Helpers ──────────────────────────────────────────────────────────────────

function evaluateRelease(params: {
  releaseMode: string;
  dripDays: number | null;
  published: boolean;
  enrolledAt: Date | null;
  previousAllDone: boolean;
}): ReleaseState {
  if (!params.published) return { state: "locked", reason: "unpublished" };

  if (params.releaseMode === "DRIP" && params.dripDays != null) {
    const base = params.enrolledAt ?? new Date();
    const unlocksAt = new Date(base.getTime() + params.dripDays * 86_400_000);
    const daysRemaining = Math.ceil(
      (unlocksAt.getTime() - Date.now()) / 86_400_000,
    );
    if (daysRemaining > 0) {
      return { state: "drip", daysRemaining, unlocksAt };
    }
    return { state: "available" };
  }

  if (params.releaseMode === "LOCKED") {
    if (!params.previousAllDone) {
      return { state: "locked", reason: "previous-incomplete" };
    }
    return { state: "available" };
  }

  return { state: "available" };
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Returns the full course outline (modules → lessons) for a viewer, with
 * per-row release evaluation already computed.
 *
 * Admins always see everything as "available" so they can navigate freely;
 * release rules apply to non-admin viewers only.
 */
export async function getCourseOutline(params: {
  courseId: string;
  viewerId: string;
  isAdmin?: boolean;
}): Promise<ModuleRow[]> {
  const [modules, orphanLessons, progressRows, enrollment] = await Promise.all([
    db.courseModule.findMany({
      where: { courseId: params.courseId },
      orderBy: { position: "asc" },
      include: {
        lessons: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    // Lessons not yet attached to a module (legacy or in-flight). We render
    // them under a synthetic "Lessons" module at the end.
    db.lesson.findMany({
      where: { courseId: params.courseId, moduleId: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.lessonProgress.findMany({
      where: { userId: params.viewerId, courseId: params.courseId },
      select: { lessonId: true, completedAt: true },
    }),
    db.courseEnrollment.findFirst({
      where: {
        userId: params.viewerId,
        courseId: params.courseId,
        status: "ACTIVE",
      },
      orderBy: { enrolledAt: "desc" },
      select: { enrolledAt: true },
    }),
  ]);

  const enrolledAt = enrollment?.enrolledAt ?? null;
  const doneMap = new Map<string, boolean>();
  for (const p of progressRows) doneMap.set(p.lessonId, !!p.completedAt);

  // Walk modules in order, tracking whether ALL prior lessons are done so
  // LOCKED rows can compute their gate cleanly.
  let runningAllDone = true;
  const out: ModuleRow[] = [];

  const allModules = [
    ...modules,
    ...(orphanLessons.length > 0
      ? [
          {
            id: `__orphans__${params.courseId}`,
            courseId: params.courseId,
            title: "Lessons",
            description: null,
            position: 9999,
            releaseMode: "PUBLISHED",
            dripDays: null,
            published: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            lessons: orphanLessons,
          },
        ]
      : []),
  ];

  for (const m of allModules) {
    // Module-level release
    const moduleRelease = params.isAdmin
      ? ({ state: "available" } as ReleaseState)
      : evaluateRelease({
          releaseMode: m.releaseMode,
          dripDays: m.dripDays,
          published: m.published,
          enrolledAt,
          previousAllDone: runningAllDone,
        });

    let runningAllDoneInModule = runningAllDone;
    const lessons: LessonRow[] = [];

    for (const l of m.lessons) {
      const completed = doneMap.get(l.id) ?? false;

      // A lesson is gated by:
      //   • the module's gate (if locked, lessons are locked)
      //   • the lesson's own releaseMode
      //   • running-all-done for LOCKED-mode lessons
      let release: ReleaseState;
      if (params.isAdmin) {
        release = { state: "available" };
      } else if (moduleRelease.state !== "available") {
        // Module gate cascades down.
        release = moduleRelease;
      } else {
        release = evaluateRelease({
          releaseMode: l.releaseMode,
          dripDays: l.dripDays,
          published: l.published,
          enrolledAt,
          previousAllDone: runningAllDoneInModule,
        });
      }

      lessons.push({
        id: l.id,
        moduleId: l.moduleId,
        slug: l.slug,
        title: l.title,
        body: l.body,
        videoUrl: l.videoUrl,
        thumbnailUrl: l.thumbnailUrl,
        durationSec: l.durationSec,
        kind: l.kind,
        releaseMode: l.releaseMode,
        dripDays: l.dripDays,
        resources: l.resources,
        published: l.published,
        position: l.position,
        completed,
        release,
      });

      if (!completed) {
        runningAllDoneInModule = false;
        runningAllDone = false;
      }
    }

    out.push({
      id: m.id,
      title: m.title,
      description: m.description,
      position: m.position,
      releaseMode: m.releaseMode,
      dripDays: m.dripDays,
      published: m.published,
      release: moduleRelease,
      lessons,
    });
  }

  return out;
}
