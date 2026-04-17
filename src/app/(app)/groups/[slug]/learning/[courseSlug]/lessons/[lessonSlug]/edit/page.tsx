import { notFound, redirect } from "next/navigation";
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
    select: { id: true },
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
    select: { id: true },
  });
  if (!course) notFound();

  const lesson = await db.lesson.findUnique({
    where: {
      courseId_slug: { courseId: course.id, slug: params.lessonSlug },
    },
  });
  if (!lesson) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Edit lesson</h1>
      </header>
      <LessonForm
        mode="edit"
        courseId={course.id}
        lesson={{
          id: lesson.id,
          title: lesson.title,
          body: lesson.body,
          videoUrl: lesson.videoUrl,
          durationSec: lesson.durationSec,
        }}
      />
    </div>
  );
}
