import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { listCoursesForGroup } from "@/server/courses";
import { CourseCard } from "@/components/courses/CourseCard";

export default async function GroupLearningPage({
  params,
}: {
  params: { slug: string };
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
  const canManage =
    !!me && me.state === "ACTIVE" && hasMinRole(me.role as Role, "ADMIN");

  const courses = await listCoursesForGroup(group.id, session.user.id);

  if (courses.length === 0 && !canManage) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
        <h2 className="text-base font-semibold">No courses yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Admins will add courses here. Check back soon.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Classroom</h1>
          <p className="text-sm text-muted-foreground">
            Courses, lessons, and learning progress.
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <CourseCard
            key={c.id}
            href={`/groups/${group.slug}/learning/${c.slug}`}
            title={c.title}
            description={c.description}
            coverUrl={c.coverUrl}
            priceType={c.priceType}
            priceLabel={c.priceLabel}
            published={c.published}
            progressPercent={c.progressPercent}
          />
        ))}
        {canManage ? (
          <Link
            href={`/groups/${group.slug}/learning/new`}
            className="group flex min-h-[260px] items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/40 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <Plus className="h-8 w-8" />
              <span className="text-sm font-medium">Add course</span>
            </div>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
