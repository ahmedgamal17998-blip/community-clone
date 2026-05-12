import Link from "next/link";
import { Trophy } from "lucide-react";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getGroupLeaderboard, getUserPoints, type Window } from "@/server/points";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { cn } from "@/lib/utils";

const WINDOWS: Window[] = ["7d", "30d", "all"];

const WINDOW_LABELS: Record<Window, string> = {
  "7d": "7 days",
  "30d": "30 days",
  all: "All-time",
};

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

  // Find viewer's rank from the fetched rows (top 50)
  const myRow = viewerId ? rows.find((r) => r.userId === viewerId) : null;
  const myRank = myRow?.rank ?? null;

  return (
    <section className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Leaderboard</h1>
            <p className="text-sm text-muted-foreground">
              Earn points by posting, commenting, reacting, and completing lessons.
            </p>
          </div>
        </div>

        {/* Viewer score card */}
        {viewerId && myPoints > 0 && (
          <div className="shrink-0 rounded-xl border border-border bg-card px-4 py-3 text-right shadow-sm">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Your score
            </div>
            <div className="text-2xl font-bold tabular-nums leading-tight text-foreground">
              {myPoints.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                pts
              </span>
            </div>
            {myRank && (
              <div className="mt-0.5 text-xs font-medium text-primary">
                Rank #{myRank}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Window tabs ── */}
      <div
        className="flex gap-1 rounded-full bg-muted p-1"
        role="tablist"
        aria-label="Time window"
      >
        {WINDOWS.map((w) => {
          const active = w === win;
          return (
            <Link
              key={w}
              href={`/groups/${group.slug}/leaderboard?window=${w}`}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-center text-sm font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              role="tab"
              aria-selected={active}
            >
              {WINDOW_LABELS[w]}
            </Link>
          );
        })}
      </div>

      {/* ── Table ── */}
      <LeaderboardTable rows={rows} viewerId={viewerId} />
    </section>
  );
}
