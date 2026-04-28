import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Video,
  FileText,
  HelpCircle,
  ClipboardList,
  Users,
  CheckCircle2,
  Clock,
  Layers,
  Award,
} from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

/**
 * Course Insights — admin-only dashboard with stats + lesson structure.
 */
export default async function CourseInsightsPage({
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
    select: { id: true, slug: true, title: true },
  });
  if (!course) notFound();

  // Fetch all stats in parallel.
  const [
    moduleCount,
    lessons,
    publishedLessons,
    enrollmentCount,
    completedLessonsTotal,
    earnedCount,
  ] = await Promise.all([
    db.courseModule.count({ where: { courseId: course.id } }),
    db.lesson.findMany({
      where: { courseId: course.id },
      select: { id: true, kind: true, durationSec: true, published: true },
    }),
    db.lesson.count({ where: { courseId: course.id, published: true } }),
    db.courseEnrollment.count({
      where: { courseId: course.id, status: "ACTIVE" },
    }),
    db.lessonProgress.count({
      where: { courseId: course.id, completedAt: { not: null } },
    }),
    db.earnedCredential.count({
      where: { credential: { courseId: course.id, kind: "COMPLETION" } },
    }),
  ]);

  // Lesson structure breakdown.
  const byKind: Record<string, number> = {};
  let totalDurationSec = 0;
  for (const l of lessons) {
    byKind[l.kind] = (byKind[l.kind] ?? 0) + 1;
    if (l.durationSec) totalDurationSec += l.durationSec;
  }

  function fmtDuration(sec: number) {
    if (sec < 60) return `${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m`;
    const hours = Math.floor(min / 60);
    const rem = min % 60;
    return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
  }

  const totalLessons = lessons.length;
  const lessonStructureRows = [
    { key: "VIDEO", label: "Video", icon: Video },
    { key: "TEXT", label: "Text", icon: FileText },
    { key: "QUIZ", label: "Quiz", icon: HelpCircle },
    { key: "ASSIGNMENT", label: "Assignment", icon: ClipboardList },
  ].filter((r) => byKind[r.key] && byKind[r.key]! > 0);

  // Per-member progress across the course (% completed).
  const memberProgress = enrollmentCount > 0 && totalLessons > 0
    ? await db.lessonProgress.groupBy({
        by: ["userId"],
        where: { courseId: course.id, completedAt: { not: null } },
        _count: { lessonId: true },
      })
    : [];
  const fullyCompleted = memberProgress.filter(
    (m) => m._count.lessonId >= publishedLessons,
  ).length;

  const courseHref = `/groups/${group.slug}/learning/${course.slug}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <Link
          href={courseHref}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Back to course"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{course.title}</h1>
          <p className="text-xs text-muted-foreground">Course insights</p>
        </div>
      </header>

      {/* Top-level tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={Layers} label="Modules" value={moduleCount} />
        <Tile icon={FileText} label="Lessons" value={publishedLessons} hint={`${totalLessons - publishedLessons} draft`} />
        <Tile icon={Clock} label="Total time" value={fmtDuration(totalDurationSec)} hint="published lessons" />
        <Tile icon={Users} label="Enrolled" value={enrollmentCount} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Lesson structure */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Layers className="h-4 w-4 text-primary" />
            Lesson structure
          </h2>
          {lessonStructureRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No lessons yet.</p>
          ) : (
            <ul className="space-y-2">
              {lessonStructureRows.map((row) => {
                const Icon = row.icon;
                const count = byKind[row.key] ?? 0;
                return (
                  <li
                    key={row.key}
                    className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{row.label}</span>
                    <span className="font-bold tabular-nums">{count}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Completion stats */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Progress
          </h2>
          <ul className="space-y-2">
            <li className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span className="flex-1">Lesson completions</span>
              <span className="font-bold tabular-nums">
                {completedLessonsTotal}
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <Award className="h-4 w-4 shrink-0 text-emerald-500" />
              <span className="flex-1">Members fully completed</span>
              <span className="font-bold tabular-nums">{fullyCompleted}</span>
            </li>
            <li className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <Award className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1">Completion certificates issued</span>
              <span className="font-bold tabular-nums">{earnedCount}</span>
            </li>
          </ul>
        </section>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Stats refresh on each page load.
      </p>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
