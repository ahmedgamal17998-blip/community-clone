import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { RulesEditor } from "./_components/RulesEditor";
import { ManualGrantList } from "./_components/ManualGrantList";

export default async function CourseAccessPage({
  params,
}: {
  params: { slug: string; courseId: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

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
    where: { id: params.courseId },
    include: { accessRules: true, manualGrants: { include: { user: true } } },
  });
  if (!course || course.groupId !== group.id) notFound();

  const members = await db.groupMembership.findMany({
    where: { groupId: group.id, state: "ACTIVE" },
    select: { user: { select: { id: true, name: true, handle: true } } },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Access rules: {course.title}</h1>
        <p className="text-sm text-muted-foreground">
          Add rules to control who can access this course. Rules combine OR-wise.
        </p>
      </div>

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
