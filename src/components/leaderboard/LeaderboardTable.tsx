"use client";

import Link from "next/link";
import { Crown, Medal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "@/server/points";
import { getLevel } from "@/lib/level";

type Props = {
  rows: LeaderboardRow[];
  viewerId: string | null;
};

const LEVEL_COLOR = [
  "", // unused index 0
  "text-muted-foreground",            // 1 Newcomer
  "text-blue-500 dark:text-blue-400", // 2 Member
  "text-emerald-600 dark:text-emerald-400", // 3 Pro
  "text-violet-600 dark:text-violet-400",   // 4 Expert
  "text-yellow-600 dark:text-yellow-400",   // 5 Legend
];

/* ── Medal config ─────────────────────────────────────────────────────────── */
const MEDAL_CFG = {
  1: {
    ring: "ring-yellow-400 dark:ring-yellow-500",
    glow: "shadow-[0_0_18px_2px_rgba(234,179,8,0.25)]",
    bg: "bg-yellow-400/10 dark:bg-yellow-500/10",
    text: "text-yellow-600 dark:text-yellow-400",
    badge: "bg-yellow-400 text-yellow-900",
    Icon: Crown,
  },
  2: {
    ring: "ring-slate-400 dark:ring-slate-300",
    glow: "shadow-[0_0_14px_1px_rgba(148,163,184,0.2)]",
    bg: "bg-slate-400/10 dark:bg-slate-300/10",
    text: "text-slate-600 dark:text-slate-300",
    badge: "bg-slate-400 text-slate-900",
    Icon: Medal,
  },
  3: {
    ring: "ring-orange-500 dark:ring-orange-400",
    glow: "shadow-[0_0_14px_1px_rgba(234,88,12,0.2)]",
    bg: "bg-orange-500/10 dark:bg-orange-400/10",
    text: "text-orange-600 dark:text-orange-400",
    badge: "bg-orange-500 text-white",
    Icon: Medal,
  },
} as const;

/* ── Podium card ──────────────────────────────────────────────────────────── */
function PodiumCard({
  row,
  isMe,
  prominent = false,
}: {
  row: LeaderboardRow;
  isMe: boolean;
  prominent?: boolean;
}) {
  const cfg = MEDAL_CFG[row.rank as 1 | 2 | 3];
  const { Icon } = cfg;
  const lvl = getLevel(row.points);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border border-border p-4 text-center transition-colors",
        cfg.bg,
        cfg.glow,
        prominent && "py-6",
        isMe && "ring-2 ring-primary/40",
      )}
    >
      {/* medal icon */}
      <Icon
        className={cn("h-5 w-5", cfg.text, prominent && "h-6 w-6")}
        strokeWidth={2}
      />

      {/* avatar + rank badge */}
      <div className="relative">
        <Avatar
          className={cn(
            "ring-4",
            cfg.ring,
            prominent ? "h-20 w-20" : "h-14 w-14",
          )}
        >
          {row.user.image ? (
            <AvatarImage src={row.user.image} alt={row.user.name ?? ""} />
          ) : null}
          <AvatarFallback
            className={cn("font-semibold", prominent ? "text-lg" : "text-sm")}
          >
            {initialsFrom(row.user.name)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[11px] font-bold leading-tight",
            cfg.badge,
          )}
        >
          #{row.rank}
        </span>
      </div>

      {/* name */}
      <div className="mt-1 min-w-0 w-full">
        <Link
          href={`/profile/${row.user.handle}`}
          className={cn(
            "block truncate font-semibold leading-snug hover:underline",
            prominent ? "text-base" : "text-sm",
          )}
        >
          {row.user.name ?? `@${row.user.handle}`}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          @{row.user.handle}
        </p>
      </div>

      {/* level badge */}
      <span className={cn("text-[11px] font-semibold", LEVEL_COLOR[lvl.level])}>
        Lv.{lvl.level} · {lvl.label}
      </span>

      {/* points */}
      <div
        className={cn(
          "font-bold tabular-nums leading-none",
          cfg.text,
          prominent ? "text-2xl" : "text-lg",
        )}
      >
        {row.points.toLocaleString()}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          pts
        </span>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export function LeaderboardTable({ rows, viewerId }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
          🏆
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No points earned yet. Be the first!
        </p>
      </div>
    );
  }

  const first = rows.find((r) => r.rank === 1);
  const second = rows.find((r) => r.rank === 2);
  const third = rows.find((r) => r.rank === 3);
  const hasPodium = !!first;
  const rest = rows.filter((r) => r.rank > 3);

  return (
    <div className="space-y-4">
      {/* ── Podium: 2nd | 1st | 3rd ─────────────────────────────────────── */}
      {hasPodium && (
        <div className="flex items-end justify-center gap-3">
          {/* #2 — left, one step down */}
          <div className="flex-1 pt-10">
            {second ? (
              <PodiumCard row={second} isMe={viewerId === second.userId} />
            ) : (
              <div />
            )}
          </div>

          {/* #1 — center, tallest */}
          <div className="flex-1">
            {first && (
              <PodiumCard row={first} isMe={viewerId === first.userId} prominent />
            )}
          </div>

          {/* #3 — right, two steps down */}
          <div className="flex-1 pt-16">
            {third ? (
              <PodiumCard row={third} isMe={viewerId === third.userId} />
            ) : (
              <div />
            )}
          </div>
        </div>
      )}

      {/* ── Ranked list: positions 4+ ────────────────────────────────────── */}
      {rest.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {rest.map((r, idx) => {
            const isMe = viewerId === r.userId;
            const lvl = getLevel(r.points);
            return (
              <div
                key={r.userId}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  idx !== 0 && "border-t border-border",
                  isMe ? "bg-primary/5" : "hover:bg-accent/40",
                )}
              >
                {/* rank circle */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums text-muted-foreground">
                  {r.rank}
                </div>

                {/* avatar */}
                <Avatar className="h-9 w-9 shrink-0">
                  {r.user.image ? (
                    <AvatarImage src={r.user.image} alt={r.user.name ?? ""} />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {initialsFrom(r.user.name)}
                  </AvatarFallback>
                </Avatar>

                {/* name + handle */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/profile/${r.user.handle}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {r.user.name ?? `@${r.user.handle}`}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    @{r.user.handle}
                  </p>
                </div>

                {/* level badge */}
                <div className="hidden shrink-0 text-right sm:block">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Level
                  </div>
                  <div className={cn("text-sm font-semibold", LEVEL_COLOR[lvl.level])}>
                    {lvl.level} · {lvl.label}
                  </div>
                </div>

                {/* points */}
                <div className="shrink-0 text-right">
                  <div className="font-bold tabular-nums text-foreground">
                    {r.points.toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    pts
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
