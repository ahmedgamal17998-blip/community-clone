import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getGroupForUser } from "@/server/group-queries";
import { listVisibleChannels } from "@/server/channels";
import { hasMinRole, type Role } from "@/server/permissions";
import { GroupThemeProvider } from "@/components/group/GroupThemeProvider";
import { GroupHeader } from "@/components/group/GroupHeader";
import { GroupAvatar } from "@/components/group/GroupAvatar";
import { joinGroupAction } from "@/server/groups";
import { GroupTabs } from "@/components/group/GroupTabs";
import { GroupRightRail } from "@/components/group/GroupRightRail";
import { ChannelSidebar } from "@/components/channel/ChannelSidebar";
import { ChannelsHorizontalRail } from "@/components/channel/ChannelsHorizontalRail";
import { hasAccess, hasAccessBulk } from "@/server/access";
import { GroupLockedView } from "@/components/access/GroupLockedView";
import { GroupShell } from "@/components/group/GroupShell";
import { PaywallPopupMount } from "@/components/access/PaywallPopup";
import { LoginPopup } from "@/components/layout/LoginPopup";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { AnnouncementPopup } from "@/components/layout/AnnouncementPopup";
import { CheckInMount } from "@/components/group/CheckInPopup";
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
  // HIDDEN groups: only visible to ACTIVE members (REQUESTED state does not grant visibility).
  if (group.visibility === "HIDDEN" && myMembership?.state !== "ACTIVE") notFound();
  // BANNED users: treat as not found to avoid leaking state.
  if (myMembership?.state === "BANNED") notFound();

  const isActiveMember = myMembership?.state === "ACTIVE";
  const isPendingMember = myMembership?.state === "REQUESTED";
  const canManage = isActiveMember
    ? hasMinRole(myMembership!.role as Role, "ADMIN")
    : false;

  // Non-members (and REQUESTED members) see a join gate instead of any content.
  // This prevents peeking at the feed/courses/etc. before joining.
  if (!isActiveMember) {
    return (
      <GroupThemeProvider primaryHsl={group.primaryHsl}>
        <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 text-center">
          <div className="mx-auto w-full max-w-sm space-y-5">
            {/* Group avatar + name */}
            <GroupAvatar
              name={group.name}
              logoUrl={group.logoUrl}
              primaryHsl={group.primaryHsl}
              size="lg"
            />
            <div>
              <h1 className="text-xl font-semibold">{group.name}</h1>
              {group.description && (
                <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {group._count.memberships} member{group._count.memberships === 1 ? "" : "s"}
              </p>
            </div>

            {isPendingMember ? (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                ⏳ Your request is pending admin approval.
              </div>
            ) : (
              <form action={joinGroupAction}>
                <input type="hidden" name="groupId" value={group.id} />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {group.visibility === "PUBLIC" ? "Join group" : "Request to join"}
                </button>
              </form>
            )}
          </div>
        </div>
      </GroupThemeProvider>
    );
  }

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
                leavePopupEnabled: group.leavePopupEnabled,
                leavePopupBody: group.leavePopupBody,
                leavePopupFontFamily: group.leavePopupFontFamily,
                leavePopupFontSizePx: group.leavePopupFontSizePx,
                leavePopupColor: group.leavePopupColor,
                leavePopupBold: group.leavePopupBold,
                leavePopupStayLabel: group.leavePopupStayLabel,
                leavePopupLeaveLabel: group.leavePopupLeaveLabel,
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

  // Real online members for the right-rail avatar stack — anyone whose
  // Presence.lastSeenAt has been updated in the last 5 minutes (matches the
  // heartbeat cadence) AND who is an ACTIVE member of this group.
  const ONLINE_WINDOW_MS = 5 * 60 * 1000;
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
  const onlineMemberships = isActiveMember
    ? await db.groupMembership.findMany({
        where: {
          groupId: group.id,
          state: "ACTIVE",
          user: {
            presence: {
              lastSeenAt: { gt: onlineSince },
            },
          },
        },
        orderBy: { user: { presence: { lastSeenAt: "desc" } } },
        take: 30,
        include: { user: { select: { id: true, name: true, image: true } } },
      })
    : [];
  const onlineMembers = onlineMemberships.slice(0, 6).map((m) => m.user);
  const extraOnlineCount = Math.max(0, onlineMemberships.length - 6);
  const onlineTotal = onlineMemberships.length;

  // Real post count for the rail.
  const postCount = isActiveMember
    ? await db.post.count({ where: { channel: { groupId: group.id } } })
    : 0;

  return (
    <GroupThemeProvider primaryHsl={group.primaryHsl}>
      {/*
        Sticky group chrome (sits below the TopNav which is sticky top-0 h-14).
        TopNav h-14 = 56px → this bar sits at top-14 (3.5rem).
      */}
      <div className="sticky top-14 z-30 border-b border-border bg-card">
        <div className="mx-auto w-full max-w-[1280px] px-3 sm:px-4">
          {/* Group header — hidden on phones; the avatar dropdown carries
              Admin/Leave actions and the TopNav shows the group name. */}
          <div className="hidden sm:block">
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
                leavePopupEnabled: group.leavePopupEnabled,
                leavePopupBody: group.leavePopupBody,
                leavePopupFontFamily: group.leavePopupFontFamily,
                leavePopupFontSizePx: group.leavePopupFontSizePx,
                leavePopupColor: group.leavePopupColor,
                leavePopupBold: group.leavePopupBold,
                leavePopupStayLabel: group.leavePopupStayLabel,
                leavePopupLeaveLabel: group.leavePopupLeaveLabel,
              }}
              myMembership={myMembership}
            />
          </div>

          <GroupTabs slug={group.slug} canManage={canManage} />
        </div>
      </div>

      {/*
        GroupShell decides whether to render the left ChannelSidebar based
        on the current pathname (Discussion only). It also handles the
        2-vs-3 column grid switch.
      */}
      <GroupShell
        groupSlug={group.slug}
        leftSidebar={
          isActiveMember ? (
            <aside data-tour="channels-list" className="hidden lg:sticky lg:top-[13rem] lg:block lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
              <ChannelSidebar
                groupSlug={group.slug}
                groupId={group.id}
                channels={channels.map((c) => ({
                  id: c.id,
                  slug: c.slug,
                  name: c.name,
                  emoji: c.emoji,
                  kind: c.kind,
                  locked: !canManage && channelAccess.get(c.id) === false,
                }))}
                canManage={canManage}
              />
            </aside>
          ) : null
        }
        mobileChannelsRail={
          isActiveMember ? (
            <ChannelsHorizontalRail
              groupSlug={group.slug}
              channels={channels.map((c) => ({
                id: c.id,
                slug: c.slug,
                name: c.name,
                emoji: c.emoji,
                kind: c.kind,
                locked: !canManage && channelAccess.get(c.id) === false,
              }))}
            />
          ) : null
        }
        rightRail={
          <aside data-tour="right-rail" className="hidden lg:sticky lg:top-[13rem] lg:block lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
            <GroupRightRail
              memberCount={group._count.memberships}
              postCount={postCount}
              onlineCount={onlineTotal}
              name={group.name}
              logoUrl={group.logoUrl}
              coverUrl={group.coverUrl}
              primaryHsl={group.primaryHsl}
              description={group.description}
              onlineMembers={onlineMembers}
              extraOnlineCount={extraOnlineCount}
            />
          </aside>
        }
      >
        {children}
      </GroupShell>

      {/* M20: login popup — re-shows after `loginPopupReshowHours` of idle.
          Default 4h. Stored in localStorage so it survives across tab
          close + reopens. */}
      {isActiveMember && group.loginPopupEnabled && group.loginPopupTitle && group.loginPopupBody && (
        <LoginPopup
          groupSlug={group.slug}
          title={group.loginPopupTitle}
          body={group.loginPopupBody}
          ctaUrl={group.loginPopupCtaUrl}
          durationSec={group.loginPopupDurationSec ?? 8}
          reshowHours={group.loginPopupReshowHours ?? 4}
        />
      )}

      {/* Daily check-in — fires once per 24 h, awards points + streak */}
      {isActiveMember && <CheckInMount groupId={group.id} />}

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

      {/* Phase 1 monetization: paywall popup mount (listens for the
          "paywall:open" custom event so any locked-content click can
          open it without prop-drilling). */}
      {isActiveMember && <PaywallPopupMount />}
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
  // userId is no longer used to filter — the snooze logic lives client-side
  // in sessionStorage. We keep the prop so callers don't have to change.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId: _userId,
}: {
  groupId: string;
  userId: string;
}) {
  const now = new Date();
  // Pick the most recent announcement that's currently within its active window.
  // We mount it on every page load — the popup itself decides whether to show
  // based on a 1-hour client-side snooze (sessionStorage).
  const announcements = await db.adminAnnouncement.findMany({
    where: {
      groupId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
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
