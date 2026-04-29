import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { LessonForm } from "@/components/courses/LessonForm";

export default async function EditLessonPage({
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
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    notFound();
  }

  const course = await db.course.findUnique({
    where: { groupId_slug: { groupId: group.id, slug: params.courseSlug } },
    select: { id: true, slug: true, title: true },
  });
  if (!course) notFound();

  const lesson = await db.lesson.findUnique({
    where: {
      courseId_slug: { courseId: course.id, slug: params.lessonSlug },
    },
  });
  if (!lesson) notFound();

  // Back goes to the outline editor — that's where the lesson row was clicked.
  const outlineHref = `/groups/${group.slug}/learning/${course.slug}/outline`;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href={outlineHref}
          aria-label="Back to course outline"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">Edit lesson</h1>
          <p className="text-xs text-muted-foreground truncate">
            {course.title} · {lesson.title}
          </p>
        </div>
      </header>
      <LessonForm
        mode="edit"
        courseId={course.id}
        lesson={{
          id: lesson.id,
          title: lesson.title,
          body: lesson.body,
          videoUrl: lesson.videoUrl,
          thumbnailUrl: lesson.thumbnailUrl,
          resources: lesson.resources,
          durationSec: lesson.durationSec,
        }}
      />
    </div>
  );
}
