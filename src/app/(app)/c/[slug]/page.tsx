/**
 * /c/[slug] — Public-facing community landing page.
 *
 * Shows:
 *  • Community name, tagline, owner avatar
 *  • Grid of visible groups (PUBLIC / PRIVATE), each with member count
 *  • "Join" / "View" CTA per group depending on membership state
 *  • Owner-only: "Manage community" link
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  Users,
  Lock,
  Globe,
  Settings,
  Plus,
  ArrowRight,
} from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getCommunityBySlug } from "@/server/community";
import { GroupAvatar } from "@/components/group/GroupAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function CommunityLandingPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  const community = await getCommunityBySlug(params.slug);
  if (!community) notFound();

  const isOwner = session?.user?.id === community.ownerId;

  // For logged-in users, fetch their group memberships in this community
  // so we can show correct CTAs per group.
  const myMemberships = session?.user?.id
    ? await db.groupMembership.findMany({
        where: {
          userId: session.user.id,
          group: { communityId: community.id, deletedAt: null },
        },
        select: { groupId: true, state: true, role: true },
      })
    : [];

  const membershipByGroupId = new Map(
    myMemberships.map((m) => [m.groupId, m]),
  );

  const groups = community.groups; // already filtered: deletedAt null + PUBLIC/PRIVATE

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-8 px-4">
      {/* ── Community hero ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Community avatar — reuse GroupAvatar with community name */}
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white text-2xl font-bold shadow-md"
            style={{
              background: `hsl(${community.primaryHsl ?? "263 74% 58%"})`,
            }}
          >
            {community.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{community.name}</h1>
            {community.tagline && (
              <p className="mt-0.5 text-muted-foreground">{community.tagline}</p>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {groups.length} group{groups.length !== 1 ? "s" : ""}
              </span>
              {community.owner && (
                <>
                  <span>·</span>
                  <Link
                    href={`/profile/${community.owner.handle}`}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    by{" "}
                    <span className="font-medium text-foreground">
                      {community.owner.name ?? community.owner.handle}
                    </span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Owner management links */}
        {isOwner && (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/owner/dashboard">
                <Settings className="h-3.5 w-3.5" />
                Manage
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/create">
                <Plus className="h-3.5 w-3.5" />
                New group
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* ── Groups grid ── */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No public groups yet.</p>
        </div>
      ) : (
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Groups
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {groups.map((group) => {
              const membership = membershipByGroupId.get(group.id);
              const memberCount = group._count.memberships;
              const isPrivate = group.visibility === "PRIVATE";

              // CTA logic
              let ctaLabel = "Join";
              let ctaHref = `/groups/${group.slug}`;
              if (membership?.state === "ACTIVE") {
                ctaLabel = "Open";
              } else if (membership?.state === "REQUESTED") {
                ctaLabel = "Pending";
                ctaHref = "#";
              }

              return (
                <div
                  key={group.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <GroupAvatar
                      name={group.name}
                      logoUrl={group.logoUrl}
                      primaryHsl={group.primaryHsl}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-semibold leading-snug">
                        {group.name}
                        {isPrivate && (
                          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Private" />
                        )}
                        {!isPrivate && (
                          <Globe className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Public" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {memberCount.toLocaleString()} member{memberCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>

                  {group.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {group.description}
                    </p>
                  )}

                  <div className="mt-auto">
                    <Button
                      asChild
                      size="sm"
                      variant={membership?.state === "ACTIVE" ? "outline" : "default"}
                      disabled={membership?.state === "REQUESTED"}
                      className={cn(
                        "w-full gap-1.5",
                        membership?.state === "REQUESTED" && "cursor-default opacity-60",
                      )}
                    >
                      <Link href={ctaHref}>
                        {ctaLabel}
                        {membership?.state !== "REQUESTED" && (
                          <ArrowRight className="h-3.5 w-3.5" />
                        )}
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
