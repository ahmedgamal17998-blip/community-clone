import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { TracksAdminClient } from "./_components/TracksAdminClient";

export const dynamic = "force-dynamic";

export default async function TracksAdminPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      tracksEnabled: true,
      trackPromotionMode: true,
      trackBadgeVisible: true,
    },
  });
  if (!group) notFound();

  const allowed = await hasCapability({
    userId: session.user.id,
    groupId: group.id,
    capability: "TRACKS_MANAGE",
  });
  if (!allowed) notFound();

  const [tracks, channels, courses, plans, members] = await Promise.all([
    db.track.findMany({
      where: { groupId: group.id, archived: false },
      orderBy: { position: "asc" },
      include: {
        channels: { select: { channelId: true } },
        courses: { select: { courseId: true } },
        _count: { select: { members: true } },
      },
    }),
    db.channel.findMany({
      where: { groupId: group.id, archived: false },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, name: true, kind: true },
    }),
    db.course.findMany({
      where: { groupId: group.id },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, title: true },
    }),
    db.subscriptionPlan.findMany({
      where: { groupId: group.id, active: true },
      select: { id: true, name: true, mappedTrackId: true },
      orderBy: { priceCents: "asc" },
    }),
    db.groupMembership.findMany({
      where: { groupId: group.id, state: "ACTIVE" },
      orderBy: { joinedAt: "desc" },
      take: 200,
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    }),
  ]);

  const trackMembers = await db.trackMember.findMany({
    where: { groupId: group.id },
    select: { userId: true, trackId: true, source: true, assignedAt: true },
  });
  const membersByTrack: Record<string, typeof trackMembers> = {};
  for (const t of tracks) membersByTrack[t.id] = [];
  for (const tm of trackMembers) {
    if (membersByTrack[tm.trackId]) membersByTrack[tm.trackId].push(tm);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tracks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pre-segment members into cohorts (Beginner, Advanced, etc.) and
          gate channels and courses by track. Public channels stay open to
          all members regardless of track.
        </p>
      </header>

      <TracksAdminClient
        groupId={group.id}
        groupSlug={group.slug}
        groupSettings={{
          tracksEnabled: group.tracksEnabled,
          trackPromotionMode: group.trackPromotionMode as "REPLACE" | "STACK",
          trackBadgeVisible: group.trackBadgeVisible,
        }}
        tracks={tracks.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          description: t.description,
          color: t.color,
          isDefault: t.isDefault,
          memberCount: t._count.members,
          channelIds: t.channels.map((c) => c.channelId),
          courseIds: t.courses.map((c) => c.courseId),
        }))}
        channels={channels}
        courses={courses}
        plans={plans}
        members={members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
        }))}
        membersByTrack={Object.fromEntries(
          Object.entries(membersByTrack).map(([trackId, rows]) => [
            trackId,
            rows.map((r) => r.userId),
          ]),
        )}
      />
    </div>
  );
}
