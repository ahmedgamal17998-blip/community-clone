import Link from "next/link";
import { Hourglass, Lock, ChevronLeft } from "lucide-react";

/**
 * Rendered in place of the lesson player when the viewer hits a lesson that
 * is gated by the module's release mode. Two shapes:
 *
 *   - DRIP: shows a countdown and the unlock date.
 *   - LOCKED: shows "complete previous lessons first" (or the unpublished
 *     reason if the admin literally turned it off).
 */
export function LockedLessonScreen({
  release,
  backHref,
  lessonTitle,
}: {
  release:
    | { state: "drip"; daysRemaining: number; unlocksAt: Date }
    | { state: "locked"; reason: "previous-incomplete" | "unpublished" };
  backHref: string;
  lessonTitle: string;
}) {
  const isDrip = release.state === "drip";

  // Friendly title + body per state.
  const title = isDrip
    ? `Available in ${release.daysRemaining} day${
        release.daysRemaining === 1 ? "" : "s"
      }`
    : release.reason === "previous-incomplete"
    ? "Locked"
    : "Not available yet";

  const body = isDrip
    ? `"${lessonTitle}" unlocks on ${release.unlocksAt.toLocaleDateString(
        undefined,
        { year: "numeric", month: "short", day: "numeric" },
      )}.`
    : release.reason === "previous-incomplete"
    ? `Finish every lesson before "${lessonTitle}" to unlock it.`
    : `"${lessonTitle}" hasn't been published yet — check back later.`;

  const Icon = isDrip ? Hourglass : Lock;
  const accent = isDrip
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30"
    : "bg-muted text-muted-foreground ring-border";

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to course
      </Link>

      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full ring-2 ${accent}`}
        >
          <Icon className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
        </div>
        {isDrip ? (
          <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Hourglass className="h-3 w-3" />
            {release.daysRemaining} day
            {release.daysRemaining === 1 ? "" : "s"} left
          </div>
        ) : null}
      </div>
    </div>
  );
}
