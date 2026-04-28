import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getGroupForUser } from "@/server/group-queries";
import { hasMinRole, type Role } from "@/server/permissions";
import { EventForm } from "@/components/events/EventForm";
import { AudienceEditor } from "@/components/events/AudienceEditor";

export default async function EditEventPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const found = await getGroupForUser(params.slug, session.user.id);
  if (!found) notFound();
  const { group, myMembership } = found;

  const event = await db.event.findUnique({ where: { id: params.id } });
  if (!event || event.groupId !== group.id) notFound();

  const isActive = myMembership?.state === "ACTIVE";
  const isAdmin = isActive && hasMinRole(myMembership!.role as Role, "ADMIN");
  const canEdit = isAdmin || event.creatorId === session.user.id;
  if (!canEdit) redirect(`/groups/${group.slug}/events/${event.id}`);

  // Load audience picker data (admin-only — only shown to admins).
  const [audienceRules, channels, courses, members] = await Promise.all([
    db.eventAudience.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
    }),
    db.channel.findMany({
      where: { groupId: group.id, archived: false },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, name: true },
    }),
    db.course.findMany({
      where: { groupId: group.id },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, title: true },
    }),
    db.groupMembership.findMany({
      where: { groupId: group.id, state: "ACTIVE" },
      orderBy: [{ role: "asc" }, { joinedAt: "desc" }],
      take: 200,
      select: {
        user: { select: { id: true, name: true, handle: true } },
      },
    }),
  ]);
  const memberOptions = members.map((m) => m.user);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Edit event</h1>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <EventForm
          groupId={group.id}
          groupSlug={group.slug}
          initial={{
            id: event.id,
            title: event.title,
            description: event.description,
            startsAt: toLocalInput(event.startsAt),
            endsAt: toLocalInput(event.endsAt),
            timezone: event.timezone,
            color: event.color,
            category: event.category,
            locationUrl: event.locationUrl,
            recurrence: (event.recurrence as "NONE" | "WEEKLY") ?? "NONE",
            recurrenceEndsAt: event.recurrenceEndsAt
              ? toLocalInput(event.recurrenceEndsAt)
              : null,
          }}
        />
      </div>

      {/* M23: audience targeting — admin only */}
      {isAdmin && (
        <div className="rounded-xl border border-border bg-card p-5">
          <AudienceEditor
            eventId={event.id}
            initialMode={event.audienceMode}
            initialRules={audienceRules.map((r) => ({
              id: r.id,
              type: r.type,
              channelId: r.channelId,
              courseId: r.courseId,
              minRole: r.minRole,
              userId: r.userId,
            }))}
            channels={channels}
            courses={courses}
            members={memberOptions}
          />
        </div>
      )}
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
