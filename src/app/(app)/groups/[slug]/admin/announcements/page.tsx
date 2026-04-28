import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { AnnouncementForm } from "./_components/AnnouncementForm";
import { AnnouncementList } from "./_components/AnnouncementList";

export default async function AdminAnnouncementsPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const allowed = await hasCapability({
    userId: session.user.id,
    groupId: group.id,
    capability: "ANNOUNCEMENTS_SEND",
  });
  if (!allowed) notFound();

  const announcements = await db.adminAnnouncement.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { seen: true } } },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Announcements</h1>
      <p className="text-sm text-muted-foreground">
        Send a popup notification to all members. Shown once per session, auto-closes
        after the configured duration.
      </p>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">New announcement</h2>
        <AnnouncementForm groupId={group.id} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent</h2>
        <AnnouncementList groupId={group.id} announcements={announcements} />
      </section>
    </div>
  );
}
