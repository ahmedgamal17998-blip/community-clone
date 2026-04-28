import Link from "next/link";
import {
  Check,
  Circle,
  PlayCircle,
  Lock as LockIcon,
  Hourglass,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Lesson = {
  id: string;
  slug: string;
  title: string;
  completed: boolean;
  // Optional release info; when omitted the lesson is treated as available.
  release?:
    | { state: "available" }
    | { state: "drip"; daysRemaining: number; unlocksAt?: Date }
    | { state: "locked"; reason?: string };
};

type ModuleGroup = {
  id: string;
  title: string;
  // Module-level release — when locked/drip, the whole group renders dimmed.
  release?: Lesson["release"];
  lessons: Lesson[];
};

type Props = {
  groupSlug: string;
  courseSlug: string;
  // Either a flat lesson list (legacy) OR module groups (new).
  lessons?: Lesson[];
  modules?: ModuleGroup[];
  activeSlug?: string;
  progressPercent: number;
};

// ── Lesson row ───────────────────────────────────────────────────────────────

function LessonRow({
  lesson,
  index,
  active,
  groupSlug,
  courseSlug,
}: {
  lesson: Lesson;
  index: number;
  active: boolean;
  groupSlug: string;
  courseSlug: string;
}) {
  const release = lesson.release ?? { state: "available" as const };
  const isLocked = release.state !== "available";

  // Locked rows render as a dimmed, non-clickable div instead of a Link.
  if (isLocked) {
    const reasonLabel =
      release.state === "drip"
        ? `Available in ${release.daysRemaining}d`
        : "Locked";
    return (
      <li>
        <div
          className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground/55"
          aria-disabled="true"
          title={reasonLabel}
        >
          <span className="shrink-0">
            {release.state === "drip" ? (
              <Hourglass className="h-4 w-4" />
            ) : (
              <LockIcon className="h-4 w-4" />
            )}
          </span>
          <span className="text-xs">{index + 1}.</span>
          <span className="line-clamp-1 flex-1">{lesson.title}</span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {release.state === "drip" ? `${release.daysRemaining}d` : "🔒"}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/groups/${groupSlug}/learning/${courseSlug}/lessons/${lesson.slug}`}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
          active
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="shrink-0">
          {lesson.completed ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : active ? (
            <PlayCircle className="h-4 w-4 text-primary" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </span>
        <span className="text-xs">{index + 1}.</span>
        <span className="line-clamp-1">{lesson.title}</span>
      </Link>
    </li>
  );
}

// ═════════════════════════════════════════════════════════════════════════════

export function LessonSidebar({
  groupSlug,
  courseSlug,
  lessons,
  modules,
  activeSlug,
  progressPercent,
}: Props) {
  // Modules path — preferred when caller passes the module hierarchy.
  if (modules && modules.length > 0) {
    let lessonIndex = 0;
    return (
      <div className="space-y-3">
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {progressPercent}% complete
          </p>
        </div>

        <div className="space-y-3">
          {modules.map((m) => {
            const moduleLocked = m.release && m.release.state !== "available";
            return (
              <div key={m.id}>
                <div
                  className={cn(
                    "mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide",
                    moduleLocked ? "text-muted-foreground/60" : "text-muted-foreground",
                  )}
                >
                  <FolderOpen className="h-3 w-3" />
                  <span className="truncate">{m.title}</span>
                  {moduleLocked && m.release?.state === "drip" && (
                    <span className="ms-auto rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                      {m.release.daysRemaining}d
                    </span>
                  )}
                  {moduleLocked && m.release?.state === "locked" && (
                    <LockIcon className="ms-auto h-3 w-3" />
                  )}
                </div>
                <ol className="space-y-0.5">
                  {m.lessons.map((l) => {
                    const idx = lessonIndex++;
                    return (
                      <LessonRow
                        key={l.id}
                        lesson={l}
                        index={idx}
                        active={l.slug === activeSlug}
                        groupSlug={groupSlug}
                        courseSlug={courseSlug}
                      />
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Legacy flat path — backward compat with existing course detail page.
  const flat = lessons ?? [];
  return (
    <div className="space-y-3">
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {progressPercent}% complete
        </p>
      </div>
      <ol className="space-y-1">
        {flat.map((l, i) => (
          <LessonRow
            key={l.id}
            lesson={l}
            index={i}
            active={l.slug === activeSlug}
            groupSlug={groupSlug}
            courseSlug={courseSlug}
          />
        ))}
      </ol>
    </div>
  );
}
