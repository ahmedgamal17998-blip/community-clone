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
      <div>
        <h1 className="text-xl font-semibold">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Send a popup to all members. While the announcement is active it
          shows on every navigation (members can snooze it for 1 hour).
        </p>
      </div>

      {/* Themed card matching the LoginPopup pattern */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold text-foreground">New announcement</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Title + body are shown to every active member. Optional CTA opens a
            link, and "Stop showing after" closes the active window.
          </p>
          <AnnouncementForm groupId={group.id} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent</h2>
        <AnnouncementList groupId={group.id} announcements={announcements} />
      </section>
    </div>
  );
}
