import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getGroupForUser } from "@/server/group-queries";
import { EventForm } from "@/components/events/EventForm";

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

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">New event</h1>
        <p className="text-xs text-muted-foreground">
          Create an event for {group.name}.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <EventForm groupId={group.id} groupSlug={group.slug} />
      </div>
    </div>
  );
}
