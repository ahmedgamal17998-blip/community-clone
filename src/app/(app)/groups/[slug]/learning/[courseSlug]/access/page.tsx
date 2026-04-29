import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { RulesEditor } from "@/app/(app)/groups/[slug]/admin/courses/[courseId]/access/_components/RulesEditor";
import { ManualGrantList } from "@/app/(app)/groups/[slug]/admin/courses/[courseId]/access/_components/ManualGrantList";

/**
 * Course access rules — admin-only.
 *
 * Lives under /learning/<courseSlug>/access (not /admin/courses/<id>/access)
 * so it inherits the regular group shell (no Admin Dashboard sidebar) and
 * shows a clear back arrow to the course outline editor.
 */
export default async function CourseAccessRulesPage({
  params,
}: {
  params: { slug: string; courseSlug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      channels: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!group) notFound();

  const allowed = await hasCapability({
    userId: session.user.id,
    groupId: group.id,
    capability: "COURSES_MANAGE",
  });
  if (!allowed) notFound();

  const course = await db.course.findUnique({
    where: { groupId_slug: { groupId: group.id, slug: params.courseSlug } },
    include: { accessRules: true, manualGrants: { include: { user: true } } },
  });
  if (!course) notFound();

  const members = await db.groupMembership.findMany({
    where: { groupId: group.id, state: "ACTIVE" },
    select: { user: { select: { id: true, name: true, handle: true } } },
    take: 200,
  });

  const outlineHref = `/groups/${group.slug}/learning/${course.slug}/outline`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Breadcrumb back to outline */}
      <header className="flex items-center gap-3">
        <Link
          href={outlineHref}
          aria-label="Back to outline"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{course.title}</h1>
          <p className="text-xs text-muted-foreground">
            Access rules · who can enter the course
          </p>
        </div>
      </header>

      <p className="text-sm text-muted-foreground">
        Add rules to control who can access this course. Rules combine OR-wise.
      </p>

      <RulesEditor
        groupId={group.id}
        courseId={course.id}
        rules={course.accessRules}
        channels={group.channels}
      />

      <ManualGrantList
        groupId={group.id}
        courseId={course.id}
        grants={course.manualGrants.map((g) => ({
          userId: g.userId,
          name: g.user.name,
          handle: g.user.handle,
        }))}
        members={members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          handle: m.user.handle,
        }))}
      />
    </div>
  );
}
