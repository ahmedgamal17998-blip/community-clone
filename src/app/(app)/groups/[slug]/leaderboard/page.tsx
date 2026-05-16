import Link from "next/link";
import {
  Trophy,
  PenLine,
  MessageCircle,
  Heart,
  BookOpen,
  Zap,
  Star,
} from "lucide-react";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  getGroupLeaderboard,
  getUserPoints,
  type Window,
} from "@/server/points";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { getLevel } from "@/lib/level";
import { cn } from "@/lib/utils";

const WINDOWS: Window[] = ["7d", "30d", "all"];
const WINDOW_LABELS: Record<Window, string> = {
  "7d": "7 days",
  "30d": "30 days",
  all: "All-time",
};

const EARN_RULES = [
  { icon: Zap,           label: "Daily check-in",            pts: 2  },
  { icon: PenLine,       label: "Write a post",              pts: 5  },
  { icon: MessageCircle, label: "Leave a comment",           pts: 2  },
  { icon: Heart,         label: "Give a reaction",           pts: 1  },
  { icon: Heart,         label: "Get a reaction on your post", pts: 2 },
  { icon: MessageCircle, label: "Get a comment on your post", pts: 3  },
  { icon: Star,          label: "Someone saves your post",   pts: 5  },
  { icon: BookOpen,      label: "Complete a lesson",         pts: 5  },
] as const;

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

  // Points for selected window (shown in table)
  const myWindowPoints = viewerId
    ? await getUserPoints({ userId: viewerId, groupId: group.id, window: win })
    : 0;

  // All-time points → used for accurate level display regardless of window
  const myAllTimePoints = viewerId
    ? await getUserPoints({ userId: viewerId, groupId: group.id, window: "all" })
    : 0;

  // Total ranked members (for percentile)
  const totalRanked = await db.pointsLedger
    .groupBy({ by: ["userId"], where: { groupId: group.id } })
    .then((r) => r.length);

  // Viewer rank from list (top 50)
  const myRow = viewerId ? rows.find((r) => r.userId === viewerId) : null;
  const myRank = myRow?.rank ?? null;

  const myLevel = getLevel(myAllTimePoints);
  const showViewerCard = viewerId && myAllTimePoints > 0;
  const percentile =
    myRank && totalRanked > 0
      ? Math.round((myRank / totalRanked) * 100)
      : null;

  return (
    <section className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Trophy className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">
            Top contributors in this group.
          </p>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_256px]">
        {/* ── Left: tabs + table ── */}
        <div className="space-y-4">
          {/* Window tabs */}
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

          {/* Leaderboard */}
          <LeaderboardTable rows={rows} viewerId={viewerId} />
        </div>

        {/* ── Right: sidebar ── */}
        <div className="space-y-4">
          {/* ── Viewer stats card ── */}
          {showViewerCard ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <Zap className="h-4 w-4" />
                Your climb
              </div>

              {/* Level + points */}
              <div className="mb-3">
                <div className="text-2xl font-bold">Level {myLevel.level}</div>
                <div className="text-sm text-muted-foreground">
                  {myLevel.label}
                </div>
              </div>

              {/* Progress bar */}
              {myLevel.nextAt !== null && (
                <div className="mb-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress to Level {myLevel.level + 1}</span>
                    <span className="font-medium text-foreground">
                      {myLevel.nextAt - myAllTimePoints} pts to go
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${myLevel.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {win === "all" ? "Total" : WINDOW_LABELS[win]} pts
                  </div>
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {myWindowPoints.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Rank
                  </div>
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {myRank ? `#${myRank}` : "—"}
                  </div>
                </div>
                {myAllTimePoints !== myWindowPoints && (
                  <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      All-time pts
                    </div>
                    <div className="text-lg font-bold tabular-nums text-foreground">
                      {myAllTimePoints.toLocaleString()}
                    </div>
                  </div>
                )}
                {percentile !== null && (
                  <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Percentile
                    </div>
                    <div className="text-lg font-bold tabular-nums text-foreground">
                      Top {percentile}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ── Earn guide ── */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
              <Star className="h-4 w-4" />
              Best ways to earn
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Every action counts — stay active to climb the ranks.
            </p>
            <div className="space-y-1">
              {EARN_RULES.map(({ icon: Icon, label, pts }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-sm">{label}</span>
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                    +{pts}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
