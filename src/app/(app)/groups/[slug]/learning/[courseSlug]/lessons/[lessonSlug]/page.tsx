import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { getCourse, getLesson, deleteLessonAction } from "@/server/courses";
import { getEnrollmentStatus } from "@/server/stripe-actions";
import { Button } from "@/components/ui/button";
import { LessonSidebar } from "@/components/courses/LessonSidebar";
import { LessonPlayer } from "@/components/courses/LessonPlayer";
import { CompleteContinueButton } from "@/components/courses/CompleteContinueButton";

export default async function LessonPage({
  params,
}: {
  params: { slug: string; courseSlug: string; lessonSlug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE") notFound();
  const isAdmin = hasMinRole(me.role as Role, "ADMIN");

  const courseData = await getCourse({
    groupId: group.id,
    slug: params.courseSlug,
    viewerId: session.user.id,
  });
  if (!courseData) notFound();

  const { course, lessons, progressPercent } = courseData;

  // M16: gate paid course access.
  if (course.priceType === "PAID" && !isAdmin) {
    const enrollment = await getEnrollmentStatus(session.user.id, course.id);
    if (!enrollment || enrollment.status !== "ACTIVE") {
      redirect(`/groups/${group.slug}/learning/${course.slug}?blocked=1`);
    }
  }
  const lessonData = await getLesson({
    courseId: course.id,
    slug: params.lessonSlug,
    viewerId: session.user.id,
  });
  if (!lessonData) notFound();
  const { lesson, prev, next, completed } = lessonData;

  // Touch lastSeenAt (fire-and-forget — we don't block render).
  // Upsert directly here so we don't need a server-action round-trip.
  await db.lessonProgress
    .upsert({
      where: {
        userId_lessonId: { userId: session.user.id, lessonId: lesson.id },
      },
      create: {
        userId: session.user.id,
        lessonId: lesson.id,
        courseId: course.id,
      },
      update: { lastSeenAt: new Date() },
    })
    .catch(() => {
      /* non-fatal */
    });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <Link
            href={`/groups/${group.slug}/learning/${course.slug}`}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to course
          </Link>
          <h2 className="mb-3 text-sm font-semibold">{course.title}</h2>
          <LessonSidebar
            groupSlug={group.slug}
            courseSlug={course.slug}
            lessons={lessons}
            activeSlug={lesson.slug}
            progressPercent={progressPercent}
          />
        </div>
      </aside>

      <div className="space-y-6">
        <LessonPlayer
          title={lesson.title}
          videoUrl={lesson.videoUrl}
          body={lesson.body}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            {prev ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/groups/${group.slug}/learning/${course.slug}/lessons/${prev.slug}`}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Link>
              </Button>
            ) : null}
            {next ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/groups/${group.slug}/learning/${course.slug}/lessons/${next.slug}`}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/groups/${group.slug}/learning/${course.slug}/lessons/${lesson.slug}/edit`}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Link>
                </Button>
                <form action={deleteLessonAction}>
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <Button type="submit" size="sm" variant="outline">
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </form>
              </>
            ) : null}
            <CompleteContinueButton
              lessonId={lesson.id}
              alreadyComplete={completed}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
