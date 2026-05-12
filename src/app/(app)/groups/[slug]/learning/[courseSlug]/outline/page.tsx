import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Settings as SettingsIcon, Lock as LockIcon, BarChart3 } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { getCourseOutline } from "@/server/course-modules";
import { CourseOutlineEditor } from "@/components/courses/CourseOutlineEditor";
import { CoursePublishToggle } from "@/components/courses/CoursePublishToggle";

/**
 * Course outline editor — modules + lessons tree with drip/lock controls.
 * Admin-only; non-admins land on /learning/[courseSlug] instead.
 */
export default async function CourseOutlinePage({
  params,
}: {
  params: { slug: string; courseSlug: string };
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
    select: { id: true, slug: true, title: true, published: true },
  });
  if (!course) notFound();

  // Migrate any "orphan" lessons (moduleId IS NULL) into a real module before
  // we hand the outline to the editor.
  //
  // getCourseOutline() injects a synthetic "__orphans__<courseId>" module so
  // the player can still display un-bucketed lessons. That synthetic id is
  // not a real CourseModule.id, so any release/drip/lock edit the admin makes
  // on that row would fail server-side ("Module not found") and the optimistic
  // pill would silently revert — the bug we're fixing here. By promoting the
  // orphans to a persisted module up front, the editor only ever sees real
  // module rows whose ids the update action can actually find.
  const orphanCount = await db.lesson.count({
    where: { courseId: course.id, moduleId: null },
  });
  if (orphanCount > 0) {
    const lastModule = await db.courseModule.findFirst({
      where: { courseId: course.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const newModule = await db.courseModule.create({
      data: {
        courseId: course.id,
        title: "Lessons",
        position: (lastModule?.position ?? -1) + 1,
        releaseMode: "PUBLISHED",
        published: true,
      },
      select: { id: true },
    });
    await db.lesson.updateMany({
      where: { courseId: course.id, moduleId: null },
      data: { moduleId: newModule.id },
    });
  }

  const outline = await getCourseOutline({
    courseId: course.id,
    viewerId: session.user.id,
    isAdmin: true,
  });

  const courseHref = `/groups/${group.slug}/learning/${course.slug}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Breadcrumb / header */}
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href={courseHref}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to course"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{course.title}</h1>
          <p className="text-xs text-muted-foreground">
            Course outline · {outline.length} module{outline.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <CoursePublishToggle
            courseId={course.id}
            initialPublished={course.published}
          />
          <Link
            href={`${courseHref}/insights`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Insights
          </Link>
          <Link
            href={`${courseHref}/edit`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            Settings
          </Link>
          <Link
            href={`/groups/${group.slug}/learning/${course.slug}/access`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
          >
            <LockIcon className="h-3.5 w-3.5" />
            Access rules
          </Link>
          <Link
            href={courseHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Preview
          </Link>
        </div>
      </header>

      <CourseOutlineEditor
        courseId={course.id}
        groupSlug={group.slug}
        courseSlug={course.slug}
        initialOutline={outline.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          position: m.position,
          releaseMode: m.releaseMode,
          dripDays: m.dripDays,
          published: m.published,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            slug: l.slug,
            title: l.title,
            kind: l.kind,
            releaseMode: l.releaseMode,
            dripDays: l.dripDays,
            published: l.published,
            position: l.position,
          })),
        }))}
      />
    </div>
  );
}
