import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getCourse, deleteCourseAction } from "@/server/courses";
import { getCourseOutline } from "@/server/course-modules";
import { getEnrollmentStatus } from "@/server/stripe-actions";
import { hasAccess } from "@/server/access";
import { getStripePK } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { LessonSidebar } from "@/components/courses/LessonSidebar";
import { CourseAccessGate } from "@/components/courses/CourseAccessGate";
import { AdminEnrollmentPanel } from "@/components/courses/AdminEnrollmentPanel";
import { CredentialsRow } from "@/components/courses/CredentialsRow";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: { slug: string; courseSlug: string };
  searchParams?: { done?: string; enrolled?: string; blocked?: string };
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

  // Per-member explicit DENY (admin-set in AccessMatrix). Admins bypass.
  if (!isAdmin) {
    const allowed = await hasAccess({
      userId: session.user.id,
      groupId: group.id,
      resourceType: "COURSE",
      resourceId: course.id,
    });
    if (!allowed) notFound();
  }

  const enrollment = await getEnrollmentStatus(session.user.id, course.id);
  const enrolled = enrollment?.status === "ACTIVE";
  const stripeConfigured = !!getStripePK();

  // Module outline + release evaluation for the sidebar.
  const outline = await getCourseOutline({
    courseId: course.id,
    viewerId: session.user.id,
    isAdmin,
  });
  const sidebarModules = outline.map((m) => ({
    id: m.id,
    title: m.title,
    release: m.release,
    lessons: m.lessons.map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      completed: l.completed,
      release: l.release,
    })),
  }));
  const hasAnyLessons = sidebarModules.some((m) => m.lessons.length > 0);

  // Phase 2: load credentials + viewer's earned status (best-effort).
  const credentials = await db.credential.findMany({
    where: { courseId: course.id },
    orderBy: { kind: "asc" },
  });
  const earnedRows = await db.earnedCredential.findMany({
    where: {
      userId: session.user.id,
      credentialId: { in: credentials.map((c) => c.id) },
    },
    select: { credentialId: true, earnedAt: true },
  });
  const earnedMap = new Map(earnedRows.map((r) => [r.credentialId, r.earnedAt]));
  const credentialViews = credentials.map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    earned: earnedMap.has(c.id),
    earnedAt: earnedMap.get(c.id) ?? null,
  }));

  // For admin enrollment panel, load all enrollments.
  const adminEnrollments = isAdmin
    ? await db.courseEnrollment.findMany({
        where: { courseId: course.id },
        orderBy: { enrolledAt: "desc" },
        include: {
          user: { select: { name: true, email: true, handle: true } },
        },
      })
    : [];

  const isPaid = course.priceType === "PAID";
  const canAccessLessons = !isPaid || enrolled || isAdmin;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-3 text-sm font-semibold">Lessons</h2>
          {!hasAnyLessons ? (
            <p className="text-xs text-muted-foreground">No lessons yet.</p>
          ) : (
            <LessonSidebar
              groupSlug={group.slug}
              courseSlug={course.slug}
              modules={sidebarModules}
              progressPercent={progressPercent}
            />
          )}
          {isAdmin ? (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <Button asChild size="sm" className="w-full">
                <Link
                  href={`/groups/${group.slug}/learning/${course.slug}/outline`}
                >
                  Edit outline
                </Link>
              </Button>
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
        {searchParams?.enrolled === "1" ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            🎉 Enrollment successful! You now have full access.
          </div>
        ) : null}

        {searchParams?.done === "1" ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            Course completed. Nice work!
          </div>
        ) : null}

        {searchParams?.blocked === "1" ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            This is a paid course. Enroll below to access lessons.
          </div>
        ) : null}

        {credentialViews.length > 0 && (
          <CredentialsRow credentials={credentialViews} />
        )}

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

        {/* Access gate / CTA */}
        <CourseAccessGate
          course={{
            id: course.id,
            priceType: course.priceType,
            priceAmount: course.priceAmount ?? null,
            currency: course.currency ?? "usd",
          }}
          enrolled={enrolled}
          stripeConfigured={stripeConfigured}
        >
          {nextLesson && canAccessLessons ? (
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
          ) : isAdmin && lessons.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
              Add your first lesson to get started.
            </div>
          ) : null}
        </CourseAccessGate>

        {/* Admin: enrollment management */}
        {isAdmin ? (
          <AdminEnrollmentPanel
            courseId={course.id}
            enrollments={adminEnrollments}
          />
        ) : null}
      </div>
    </div>
  );
}
