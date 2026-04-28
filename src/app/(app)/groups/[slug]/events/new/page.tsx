import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getGroupForUser } from "@/server/group-queries";
import { hasMinRole, type Role } from "@/server/permissions";
import { EventForm } from "@/components/events/EventForm";
import { AudienceEditor } from "@/components/events/AudienceEditor";

export default async function NewEventPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const found = await getGroupForUser(params.slug, session.user.id);
  if (!found) notFound();
  const { group, myMembership } = found;
  if (!myMembership || myMembership.state !== "ACTIVE") {
    redirect(`/groups/${group.slug}/events`);
  }

  const isAdmin = hasMinRole(myMembership.role as Role, "ADMIN");

  // Pre-load audience picker data — admin only renders the audience editor.
  const [channels, courses, members] = isAdmin
    ? await Promise.all([
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
      ])
    : [[], [], []];
  const memberOptions = members.map((m: { user: { id: string; name: string | null; handle: string } }) => m.user);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">New event</h1>
        <p className="text-xs text-muted-foreground">
          Create an event for {group.name}.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <EventForm
          groupId={group.id}
          groupSlug={group.slug}
          audienceSlot={
            isAdmin ? (
              <AudienceEditor
                initialMode="ALL"
                initialRules={[]}
                channels={channels}
                courses={courses}
                members={memberOptions}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
