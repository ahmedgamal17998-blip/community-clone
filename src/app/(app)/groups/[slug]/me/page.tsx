import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { remainingDays } from "@/server/access";
import { SubscriptionCard } from "./_components/SubscriptionCard";
import { AccessibleResources } from "./_components/AccessibleResources";
import { ProfileEditor } from "./_components/ProfileEditor";
import { Layers } from "lucide-react";

/**
 * M18: Member self-view.
 *
 * Shows:
 *  - Remaining subscription days + extend/activate plan buttons
 *  - Channels & group chats they have access to
 *  - Profile editor (name / bio / image)
 */
export default async function MemberSelfPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    include: {
      subscriptionPlans: {
        where: { active: true },
        orderBy: { priceCents: "asc" },
      },
    },
  });
  if (!group) notFound();

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, bio: true, image: true, handle: true, email: true },
  });
  if (!me) notFound();

  const days = await remainingDays({ userId: me.id, groupId: group.id });

  // Multi-plan support: list every active subscription, ordered by next-end.
  const activeSubs = await db.subscription.findMany({
    where: { userId: me.id, groupId: group.id, status: "ACTIVE" },
    orderBy: { currentPeriodEnd: "desc" },
    include: { plan: true },
  });

  // Channels the user can access
  const channels = await db.channel.findMany({
    where: { groupId: group.id, archived: false },
    orderBy: { position: "asc" },
    select: { id: true, name: true, slug: true, emoji: true },
  });

  // Group chats they're a participant in
  const chatThreads = await db.chatThread.findMany({
    where: {
      groupId: group.id,
      kind: "GROUP",
      participants: { some: { userId: me.id } },
    },
    select: { id: true, title: true },
  });

  // M28: primary track for the badge — only when group has tracks enabled
  // AND the badge is visible per group setting.
  const primaryTrackRow =
    group.tracksEnabled && group.trackBadgeVisible
      ? await db.trackMember.findFirst({
          where: {
            userId: me.id,
            groupId: group.id,
            track: { archived: false },
          },
          orderBy: { track: { position: "asc" } },
          select: {
            track: { select: { name: true, color: true } },
          },
        })
      : null;
  const primaryTrack = primaryTrackRow?.track ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My subscription</h1>

      {primaryTrack && (
        <div
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm"
          style={{
            borderColor: primaryTrack.color
              ? `hsl(${primaryTrack.color} / 0.4)`
              : undefined,
            background: primaryTrack.color
              ? `hsl(${primaryTrack.color} / 0.08)`
              : undefined,
          }}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="text-xs text-muted-foreground">Track</span>
          <span className="font-semibold">{primaryTrack.name}</span>
        </div>
      )}

      <SubscriptionCard
        remainingDays={days}
        activeSubs={activeSubs.map((s) => ({
          id: s.id,
          planName: s.plan.name,
          currentPeriodEnd: s.currentPeriodEnd,
          cancelRequestedAt: s.cancelRequestedAt,
          hasExternal: s.externalSubscriptionId != null,
        }))}
        plans={group.subscriptionPlans.map((p) => ({
          id: p.id,
          name: p.name,
          durationDays: p.durationDays,
          priceCents: p.priceCents,
          currency: p.currency,
          externalProductSlug: p.externalProductSlug,
          externalPlanType: p.externalPlanType,
        }))}
      />

      <AccessibleResources
        groupId={group.id}
        userId={me.id}
        groupSlug={group.slug}
        channels={channels}
        chatThreads={chatThreads}
      />

      <ProfileEditor
        initialName={me.name ?? ""}
        initialBio={me.bio ?? ""}
        initialImage={me.image ?? ""}
      />
    </div>
  );
}
