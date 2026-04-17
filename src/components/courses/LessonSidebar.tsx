import Link from "next/link";
import { Check, Circle, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Lesson = {
  id: string;
  slug: string;
  title: string;
  completed: boolean;
};

type Props = {
  groupSlug: string;
  courseSlug: string;
  lessons: Lesson[];
  activeSlug?: string;
  progressPercent: number;
};

export function LessonSidebar({
  groupSlug,
  courseSlug,
  lessons,
  activeSlug,
  progressPercent,
}: Props) {
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
        {lessons.map((l, i) => {
          const active = l.slug === activeSlug;
          return (
            <li key={l.id}>
              <Link
                href={`/groups/${groupSlug}/learning/${courseSlug}/lessons/${l.slug}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="shrink-0">
                  {l.completed ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : active ? (
                    <PlayCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{i + 1}.</span>
                <span className="line-clamp-1">{l.title}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
