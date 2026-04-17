import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getCourse, deleteCourseAction } from "@/server/courses";
import { Button } from "@/components/ui/button";
import { LessonSidebar } from "@/components/courses/LessonSidebar";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: { slug: string; courseSlug: string };
  searchParams?: { done?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const data = await getCourse({
    groupId: group.id,
    slug: params.courseSlug,
    viewerId: session.user.id,
  });
  if (!data) notFound();
  const { course, lessons, progressPercent, isAdmin, nextLesson } = data;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-3 text-sm font-semibold">Lessons</h2>
          {lessons.length === 0 ? (
            <p className="text-xs text-muted-foreground">No lessons yet.</p>
          ) : (
            <LessonSidebar
              groupSlug={group.slug}
              courseSlug={course.slug}
              lessons={lessons}
              progressPercent={progressPercent}
            />
          )}
          {isAdmin ? (
            <div className="mt-3 border-t border-border pt-3">
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link
                  href={`/groups/${group.slug}/learning/${course.slug}/lessons/new`}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add lesson
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="space-y-6">
        {searchParams?.done === "1" ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            Course completed. Nice work!
          </div>
        ) : null}

        <header className="space-y-3">
          {course.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.coverUrl}
              alt=""
              className="aspect-[16/9] w-full rounded-xl object-cover"
            />
          ) : (
            <div
              className="aspect-[16/9] w-full rounded-xl"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(263 74% 38%) 100%)",
              }}
            />
          )}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold">{course.title}</h1>
                {!course.published ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Draft
                  </span>
                ) : null}
              </div>
              {course.description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {course.description}
                </p>
              ) : null}
            </div>
            {isAdmin ? (
              <div className="flex flex-shrink-0 gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/groups/${group.slug}/learning/${course.slug}/edit`}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Link>
                </Button>
                <form action={deleteCourseAction}>
                  <input type="hidden" name="courseId" value={course.id} />
                  <Button type="submit" size="sm" variant="outline">
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        </header>

        {nextLesson ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {progressPercent === 0 ? "Start here" : "Continue"}
              </p>
              <p className="text-sm font-medium">{nextLesson.title}</p>
            </div>
            <Button asChild>
              <Link
                href={`/groups/${group.slug}/learning/${course.slug}/lessons/${nextLesson.slug}`}
              >
                {progressPercent === 0 ? "Start course" : "Resume"}
              </Link>
            </Button>
          </div>
        ) : isAdmin ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
            Add your first lesson to get started.
          </div>
        ) : null}
      </div>
    </div>
  );
}
