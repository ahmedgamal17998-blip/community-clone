import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getGroupLeaderboard, getUserPoints, type Window } from "@/server/points";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { cn } from "@/lib/utils";

const WINDOWS: Window[] = ["7d", "30d", "all"];

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { window?: string };
}) {
  const session = await auth();
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true, deletedAt: true },
  });
  if (!group || group.deletedAt) notFound();

  const win: Window = WINDOWS.includes((searchParams.window ?? "") as Window)
    ? (searchParams.window as Window)
    : "all";

  const rows = await getGroupLeaderboard({
    groupId: group.id,
    window: win,
    limit: 50,
  });

  const viewerId = session?.user?.id ?? null;
  const myPoints = viewerId
    ? await getUserPoints({ userId: viewerId, groupId: group.id, window: win })
    : 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">
            Earn points by posting, commenting, receiving reactions, and completing lessons.
          </p>
        </div>
        {viewerId ? (
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Your points
            </div>
            <div className="text-lg font-bold tabular-nums">{myPoints}</div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-1 rounded-full bg-muted p-1" role="tablist">
        {WINDOWS.map((w) => {
          const active = w === win;
          const label = w === "7d" ? "7 days" : w === "30d" ? "30 days" : "All-time";
          return (
            <Link
              key={w}
              href={`/groups/${group.slug}/leaderboard?window=${w}`}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              role="tab"
              aria-selected={active}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <LeaderboardTable rows={rows} viewerId={viewerId} />
    </section>
  );
}
