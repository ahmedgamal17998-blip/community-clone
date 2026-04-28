import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getGroupForUser } from "@/server/group-queries";
import { listVisibleChannels } from "@/server/channels";
import { hasMinRole, type Role } from "@/server/permissions";
import { GroupThemeProvider } from "@/components/group/GroupThemeProvider";
import { GroupHeader } from "@/components/group/GroupHeader";
import { GroupTabs } from "@/components/group/GroupTabs";
import { GroupRightRail } from "@/components/group/GroupRightRail";
import { ChannelSidebar } from "@/components/channel/ChannelSidebar";
import { hasAccess, hasAccessBulk } from "@/server/access";
import { GroupLockedView } from "@/components/access/GroupLockedView";
import { LoginPopup } from "@/components/layout/LoginPopup";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { AnnouncementPopup } from "@/components/layout/AnnouncementPopup";
import { db } from "@/server/db";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const found = await getGroupForUser(params.slug, session.user.id);
  if (!found) notFound();
  const { group, myMembership } = found;

  // Soft-deleted groups: only OWNER sees; others get 404.
  if (group.deletedAt && myMembership?.role !== "OWNER") notFound();
  // HIDDEN groups: only visible to members.
  if (group.visibility === "HIDDEN" && !myMembership) notFound();
  // BANNED users: treat as not found to avoid leaking state.
  if (myMembership?.state === "BANNED") notFound();

  const isActiveMember = myMembership?.state === "ACTIVE";
  const canManage = isActiveMember
    ? hasMinRole(myMembership!.role as Role, "ADMIN")
    : false;

  // Group-level access gate: a member can be locked or expired by an admin
  // even though their state is ACTIVE. Admins/Owners always bypass.
  // We render a friendly locked view instead of 404 so the member can find
  // the renew/contact CTA on their subscription page.
  const isGroupAccessAllowed =
    !isActiveMember || canManage
      ? true
      : await hasAccess({
          userId: session.user.id,
          groupId: group.id,
          resourceType: "GROUP",
          resourceId: group.id,
        });

  if (isActiveMember && !canManage && !isGroupAccessAllowed) {
    const reason: "LOCKED" | "EXPIRED" = myMembership?.lockedAt
      ? "LOCKED"
      : "EXPIRED";
    return (
      <GroupThemeProvider primaryHsl={group.primaryHsl}>
        <div className="border-b border-border bg-card">
          <div className="mx-auto w-full max-w-[1280px] px-3 sm:px-4">
            <GroupHeader
              group={{
                id: group.id,
                name: group.name,
                slug: group.slug,
                description: group.description,
                logoUrl: group.logoUrl,
                primaryHsl: group.primaryHsl,
                visibility: group.visibility,
                memberCount: group._count.memberships,
              }}
              myMembership={myMembership}
            />
          </div>
        </div>
        <GroupLockedView
          groupSlug={group.slug}
          groupName={group.name}
          reason={reason}
        />
      </GroupThemeProvider>
    );
  }

  const channels = isActiveMember
    ? await listVisibleChannels(group.id, session.user.id)
    : [];

  // Compute per-channel access for the viewer so the sidebar can dim/lock rows
  // the admin has explicitly DENY'd.
  const channelAccess = isActiveMember && channels.length > 0
    ? await hasAccessBulk({
        userId: session.user.id,
        groupId: group.id,
        resourceType: "CHANNEL",
        resourceIds: channels.map((c) => c.id),
      })
    : new Map<string, boolean>();

  // Fetch recently-joined members for the right-rail avatar stack.
  const recentMemberships = isActiveMember
    ? await db.groupMembership.findMany({
        where: { groupId: group.id, state: "ACTIVE" },
        orderBy: { joinedAt: "desc" },
        take: 10,
        include: { user: { select: { id: true, name: true, image: true } } },
      })
    : [];
  const onlineMembers = recentMemberships.slice(0, 6).map((m) => m.user);
  const extraOnlineCount = Math.max(0, recentMemberships.length - 6);

  return (
    <GroupThemeProvider primaryHsl={group.primaryHsl}>
      {/*
        Sticky group chrome (sits below the TopNav which is sticky top-0 h-14).
        TopNav h-14 = 56px → this bar sits at top-14 (3.5rem).
      */}
      <div className="sticky top-14 z-30 border-b border-border bg-card">
        <div className="mx-auto w-full max-w-[1280px] px-3 sm:px-4">
          <GroupHeader
            group={{
              id: group.id,
              name: group.name,
              slug: group.slug,
              description: group.description,
              logoUrl: group.logoUrl,
              primaryHsl: group.primaryHsl,
              visibility: group.visibility,
              memberCount: group._count.memberships,
            }}
            myMembership={myMembership}
          />
          <GroupTabs slug={group.slug} />
        </div>
      </div>

      {/*
        Three-column shell.
        - `items-start` → sidebars act as sticky columns (their height is their
          natural height, not stretched to the grid row).
        - Left + right `aside` use `sticky top-[<topnav + header>]` so they
          park just under the chrome when the page scrolls.
        - Middle column is the only thing that grows tall and triggers scroll.
      */}
      <div
        className={
          isActiveMember
            ? "mx-auto grid w-full max-w-[1280px] grid-cols-1 items-start gap-6 px-3 py-6 sm:px-4 lg:grid-cols-[240px_1fr_280px]"
            : "mx-auto grid w-full max-w-[1280px] grid-cols-1 items-start gap-6 px-3 py-6 sm:px-4 lg:grid-cols-[1fr_280px]"
        }
      >
        {isActiveMember ? (
          <aside className="hidden lg:sticky lg:top-[13rem] lg:block lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
            <ChannelSidebar
              groupSlug={group.slug}
              groupId={group.id}
              channels={channels.map((c) => ({
                id: c.id,
                slug: c.slug,
                name: c.name,
                emoji: c.emoji,
                kind: c.kind,
                // Admins always see all channels active (so they can manage).
                // Locked = explicit DENY for non-managers only.
                locked: !canManage && channelAccess.get(c.id) === false,
              }))}
              canManage={canManage}
            />
          </aside>
        ) : null}
        <div className="min-w-0">{children}</div>
        <aside className="hidden lg:sticky lg:top-[13rem] lg:block lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
          <GroupRightRail
            memberCount={group._count.memberships}
            visibility={group.visibility}
            createdAt={group.createdAt}
            name={group.name}
            logoUrl={group.logoUrl}
            primaryHsl={group.primaryHsl}
            description={group.description}
            onlineMembers={onlineMembers}
            extraOnlineCount={extraOnlineCount}
          />
        </aside>
      </div>

      {/* M20: login popup */}
      {isActiveMember && group.loginPopupEnabled && group.loginPopupTitle && group.loginPopupBody && (
        <LoginPopup
          groupSlug={group.slug}
          title={group.loginPopupTitle}
          body={group.loginPopupBody}
          ctaUrl={group.loginPopupCtaUrl}
          durationSec={group.loginPopupDurationSec ?? 8}
        />
      )}

      {/* M21: onboarding tour (loaded async) */}
      {isActiveMember && myMembership && !myMembership.onboardingCompletedAt && (
        <OnboardingMount groupId={group.id} />
      )}

      {/* M26: admin announcements (loaded async) */}
      {isActiveMember && (
        <AnnouncementsMount groupId={group.id} userId={session.user.id} />
      )}

      {/* M26: dynamic favicon */}
      {group.faviconUrl && (
        <link rel="icon" href={group.faviconUrl} />
      )}
    </GroupThemeProvider>
  );
}

async function OnboardingMount({ groupId }: { groupId: string }) {
  const config = await db.onboardingConfig.findUnique({ where: { groupId } });
  if (!config?.enabled) return null;
  let steps: Array<{ target: string; title: string; body: string; order: number }> = [];
  try {
    steps = JSON.parse(config.steps);
  } catch {
    steps = [];
  }
  if (steps.length === 0) return null;
  return <OnboardingTour groupId={groupId} steps={steps} />;
}

async function AnnouncementsMount({
  groupId,
  userId,
}: {
  groupId: string;
  userId: string;
}) {
  const now = new Date();
  const announcements = await db.adminAnnouncement.findMany({
    where: {
      groupId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      seen: { none: { userId } },
    },
    take: 1,
    orderBy: { createdAt: "desc" },
  });
  if (announcements.length === 0) return null;
  const a = announcements[0];
  return (
    <AnnouncementPopup
      announcement={{
        id: a.id,
        title: a.title,
        body: a.body,
        ctaUrl: a.ctaUrl,
        durationSec: a.durationSec,
      }}
    />
  );
}
