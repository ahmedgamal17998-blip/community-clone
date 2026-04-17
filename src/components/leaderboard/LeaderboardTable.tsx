import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "@/server/points";

type Props = {
  rows: LeaderboardRow[];
  viewerId: string | null;
};

export function LeaderboardTable({ rows, viewerId }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No points awarded yet in this window.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {rows.map((r) => {
        const isMe = viewerId === r.userId;
        return (
          <div
            key={r.userId}
            className={cn(
              "flex items-center gap-3 p-3",
              isMe && "bg-primary/5",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                r.rank === 1 && "bg-yellow-400/20 text-yellow-600 dark:text-yellow-300",
                r.rank === 2 && "bg-slate-400/20 text-slate-600 dark:text-slate-300",
                r.rank === 3 && "bg-orange-400/20 text-orange-600 dark:text-orange-300",
                r.rank > 3 && "bg-muted text-muted-foreground",
              )}
            >
              {r.rank}
            </div>
            <Avatar className="h-9 w-9">
              {r.user.image ? (
                <AvatarImage src={r.user.image} alt={r.user.name ?? ""} />
              ) : null}
              <AvatarFallback>{initialsFrom(r.user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Link
                href={`/profile/@${r.user.handle}`}
                className="truncate font-medium hover:underline"
              >
                {r.user.name ?? `@${r.user.handle}`}
              </Link>
              <p className="text-xs text-muted-foreground">@{r.user.handle}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums">{r.points}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                points
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
