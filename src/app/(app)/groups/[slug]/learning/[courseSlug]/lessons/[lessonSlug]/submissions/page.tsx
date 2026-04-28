import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { GradingList } from "@/components/courses/GradingList";

/**
 * Admin-only — list all submissions for an assignment lesson, grade them.
 */
export default async function AssignmentSubmissionsPage({
  params,
}: {
  params: { slug: string; courseSlug: string; lessonSlug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
    where: { courseId_slug: { courseId: course.id, slug: params.lessonSlug } },
    select: { id: true, title: true, kind: true },
  });
  if (!lesson || lesson.kind !== "ASSIGNMENT") notFound();

  const assignment = await db.assignment.findUnique({
    where: { lessonId: lesson.id },
    include: {
      submissions: {
        orderBy: { submittedAt: "desc" },
        include: {
          user: { select: { id: true, name: true, handle: true, image: true } },
        },
      },
    },
  });

  if (!assignment) {
    return (
      <section className="space-y-4">
        <Link
          href={`/groups/${group.slug}/learning/${course.slug}/lessons/${params.lessonSlug}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to lesson
        </Link>
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          This assignment hasn't been set up yet.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <Link
        href={`/groups/${group.slug}/learning/${course.slug}/lessons/${params.lessonSlug}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to lesson
      </Link>
      <header>
        <h1 className="text-xl font-semibold">{lesson.title}</h1>
        <p className="text-sm text-muted-foreground">
          {assignment.submissions.length} submission
          {assignment.submissions.length === 1 ? "" : "s"} · Max score {assignment.maxScore}
        </p>
      </header>

      <GradingList
        maxScore={assignment.maxScore}
        submissions={assignment.submissions.map((s) => ({
          id: s.id,
          userName: s.user.name ?? `@${s.user.handle}`,
          userHandle: s.user.handle,
          userImage: s.user.image,
          textAnswer: s.textAnswer,
          fileUrl: s.fileUrl,
          score: s.score,
          feedback: s.feedback,
          gradedAt: s.gradedAt,
          submittedAt: s.submittedAt,
        }))}
      />
    </section>
  );
}
