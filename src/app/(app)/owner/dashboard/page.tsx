/**
 * /owner/dashboard — Platform owner overview.
 *
 * Shows all communities the signed-in user owns, with per-community stats
 * (group count, total members, plan badge). Links to community landing,
 * first group, and a "Create new community" CTA.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  Users,
  FolderOpen,
  Plus,
  ArrowRight,
  LayoutGrid,
  ExternalLink,
  Archive,
} from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getOwnedCommunities } from "@/server/community";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/plans";
import { PLAN_CONFIGS } from "@/lib/plans";

// ─── Plan badge ──────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const cfg = PLAN_CONFIGS[plan as Plan] ?? PLAN_CONFIGS.FREE;
  const colors: Record<Plan, string> = {
    FREE:       "bg-muted text-muted-foreground",
    PRO:        "bg-primary/10 text-primary",
    ENTERPRISE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        colors[(plan as Plan) in colors ? (plan as Plan) : "FREE"],
      )}
    >
      {cfg.label}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function OwnerDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const communities = await getOwnedCommunities(session.user.id);

  // For each community, fetch total active member count across all groups
  const communityStats = await Promise.all(
    communities.map(async (c) => {
      const [memberCount, groupsWithMembers] = await Promise.all([
        db.groupMembership.count({
          where: {
            group: { communityId: c.id, deletedAt: null },
            state: "ACTIVE",
          },
        }),
        db.group.findMany({
          where: { communityId: c.id, deletedAt: null },
          select: { id: true, slug: true, name: true, logoUrl: true, primaryHsl: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return {
        ...c,
        totalMembers: memberCount,
        firstGroup: groupsWithMembers[0] ?? null,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-8 px-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My communities</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage and grow your communities.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/create">
            <Plus className="h-4 w-4" />
            New community
          </Link>
        </Button>
      </div>

      {/* ── Empty state ── */}
      {communityStats.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <Building2 className="mb-4 h-10 w-10 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold">No communities yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first community and start building your audience.
          </p>
          <Button asChild className="mt-5 gap-2">
            <Link href="/create">
              <Plus className="h-4 w-4" />
              Create community
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {communityStats.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center"
            >
              {/* Left: avatar + name */}
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white shadow"
                  style={{ background: `hsl(${c.primaryHsl ?? "263 74% 58%"})` }}
                >
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/c/${c.slug}`}
                      className="truncate font-semibold hover:text-primary"
                    >
                      {c.name}
                    </Link>
                    <PlanBadge plan={c.plan} />
                  </div>
                  {c.tagline && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {c.tagline}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FolderOpen className="h-3.5 w-3.5" />
                      {c._count.groups} group{c._count.groups !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {c.totalMembers.toLocaleString()} member{c.totalMembers !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 opacity-60">
                      nadi.app/c/{c.slug}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: actions */}
              <div className="flex shrink-0 flex-wrap gap-2">
                {c.firstGroup && (
                  <Button asChild variant="default" size="sm" className="gap-1.5">
                    <Link href={`/groups/${c.firstGroup.slug}`}>
                      <LayoutGrid className="h-3.5 w-3.5" />
                      Open
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={`/c/${c.slug}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Landing page
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Utility links ── */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <Link href="/owner/archive">
            <Archive className="h-4 w-4" />
            Archived groups
          </Link>
        </Button>
      </div>
    </div>
  );
}
