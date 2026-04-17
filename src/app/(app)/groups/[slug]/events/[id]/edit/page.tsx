import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getGroupForUser } from "@/server/group-queries";
import { hasMinRole, type Role } from "@/server/permissions";
import { EventForm } from "@/components/events/EventForm";

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
