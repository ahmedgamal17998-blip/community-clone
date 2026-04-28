/**
 * One-time backfill: every existing course gets a default "Lessons" module,
 * and every lesson with moduleId=null is migrated under it (preserving
 * lesson position).
 *
 *   npx tsx scripts/backfill-course-modules.ts
 */
import { db } from "@/server/db";

async function main() {
  const courses = await db.course.findMany({
    select: { id: true, title: true },
  });

  let coursesTouched = 0;
  let lessonsMoved = 0;

  for (const course of courses) {
    const orphanLessons = await db.lesson.findMany({
      where: { courseId: course.id, moduleId: null },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    if (orphanLessons.length === 0) continue;

    // Reuse an existing default module if one already exists for this course.
    let defaultModule = await db.courseModule.findFirst({
      where: { courseId: course.id, position: 0 },
    });
    if (!defaultModule) {
      defaultModule = await db.courseModule.create({
        data: {
          courseId: course.id,
          title: "Lessons",
          position: 0,
          releaseMode: "PUBLISHED",
          published: true,
        },
      });
    }

    await db.lesson.updateMany({
      where: { id: { in: orphanLessons.map((l) => l.id) } },
      data: { moduleId: defaultModule.id },
    });

    coursesTouched++;
    lessonsMoved += orphanLessons.length;
  }

  console.log(
    `Backfill complete — wrapped ${lessonsMoved} lesson(s) across ${coursesTouched} course(s) into default modules.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
