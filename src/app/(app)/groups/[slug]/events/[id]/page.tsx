import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { auth } from "@/server/auth";
import { getGroupForUser } from "@/server/group-queries";
import { getEvent } from "@/server/events";
import { hasMinRole, type Role } from "@/server/permissions";
import { canPassAudience } from "@/server/event-access";
import { hasAccess } from "@/server/access";
import { formatInTZ } from "@/lib/calendar";
import { Button } from "@/components/ui/button";
import { RsvpButtons } from "@/components/events/RsvpButtons";
import { ShareButton } from "@/components/events/ShareButton";
import { DeleteEventButton } from "@/components/events/DeleteEventButton";
import { IcsDownloadLink } from "@/components/events/IcsDownloadLink";
import { Copy } from "lucide-react";
import { duplicateEventAction } from "@/server/actions/duplicate-event";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string; id: string };
  searchParams?: { occ?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const found = await getGroupForUser(params.slug, session.user.id);
  if (!found) notFound();
  const { group, myMembership } = found;

  const result = await getEvent({ eventId: params.id, viewerId: session.user.id });
  if (!result) notFound();
  const { event, rsvps } = result;
  if (event.groupId !== group.id) notFound();

  const isActive = myMembership?.state === "ACTIVE";
  const isAdmin = isActive && hasMinRole(myMembership!.role as Role, "ADMIN");
  const canEdit = isAdmin || event.creatorId === session.user.id;

  // M23 audience gate — non-admins must match the event's audience.
  // M30 tier gate — premium events with no access either 404 (HIDDEN) or
  // redirect back to the calendar with the paywall popup signal (LOCKED).
  if (!isAdmin && event.creatorId !== session.user.id) {
    const audienceOk = await canPassAudience({
      userId: session.user.id,
      eventId: event.id,
    });
    if (!audienceOk) notFound();

    if (event.tier === "PREMIUM") {
      const accessOk = await hasAccess({
        userId: session.user.id,
        groupId: event.groupId,
        resourceType: "EVENT",
        resourceId: event.id,
      });
      if (!accessOk) {
        // HIDDEN events: leak nothing.
        if (event.visibility === "HIDDEN") notFound();
        // LOCKED_VISIBLE: bounce to the events calendar with the paywall.
        // The calendar already opens the paywall for locked rows; we just
        // make sure direct URLs don't reveal the detail.
        redirect(`/groups/${group.slug}/events?locked=${encodeURIComponent(event.title)}`);
      }
    }
  }

  // Figure out the occurrence
  let occDate: Date | null = null;
  if (searchParams?.occ) {
    const d = new Date(searchParams.occ);
    if (!isNaN(d.getTime())) occDate = d;
  }
  if (!occDate) occDate = event.startsAt;

  const occIso = event.recurrence === "WEEKLY" ? occDate.toISOString() : null;

  // Build counts for this occurrence (for recurring, count RSVPs matching occ; otherwise all)
  const relevantRsvps = event.recurrence === "WEEKLY"
    ? rsvps.filter((r) => r.occurrenceStartsAt && sameInstant(r.occurrenceStartsAt, occDate!))
    : rsvps;

  const counts = { GOING: 0, MAYBE: 0, DECLINED: 0 };
  for (const r of relevantRsvps) {
    if (r.status === "GOING" || r.status === "MAYBE" || r.status === "DECLINED") {
      counts[r.status as keyof typeof counts]++;
    }
  }

  const myRsvp = relevantRsvps.find((r) => r.userId === session.user!.id);
  const myStatus =
    myRsvp?.status === "GOING" ||
    myRsvp?.status === "MAYBE" ||
    myRsvp?.status === "DECLINED"
      ? (myRsvp.status as "GOING" | "MAYBE" | "DECLINED")
      : null;

  const durationMs = event.endsAt.getTime() - event.startsAt.getTime();
  const occEnd = new Date(occDate.getTime() + durationMs);

  const viewerTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const sameTz = viewerTz === event.timezone;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href={`/groups/${group.slug}/events`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to calendar
        </Link>
      </div>

      <div
        className="overflow-hidden rounded-xl border border-border bg-card"
        style={{ borderLeft: `6px solid ${event.color}` }}
      >
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{event.title}</h1>
              {event.category ? (
                <span
                  className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: `${event.color}22`,
                    color: event.color,
                  }}
                >
                  {event.category}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <ShareButton />
              <IcsDownloadLink eventId={event.id} />
              {canEdit ? (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/groups/${group.slug}/events/${event.id}/edit`}>
                      Edit
                    </Link>
                  </Button>
                  <form action={duplicateEventAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button type="submit" variant="outline" size="sm" className="gap-1">
                      <Copy className="h-3.5 w-3.5" />
                      Duplicate
                    </Button>
                  </form>
                  <DeleteEventButton eventId={event.id} />
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">When: </span>
              <span>
                {formatInTZ(occDate, event.timezone)} – {formatInTZ(occEnd, event.timezone, { timeStyle: "short" })}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({event.timezone})
                </span>
              </span>
            </div>
            {!sameTz ? (
              <div className="text-xs text-muted-foreground">
                Your time: {formatInTZ(occDate, viewerTz)} – {formatInTZ(occEnd, viewerTz, { timeStyle: "short" })} ({viewerTz})
              </div>
            ) : null}
            {event.recurrence === "WEEKLY" ? (
              <div className="text-xs text-muted-foreground">Repeats weekly</div>
            ) : null}
            {event.locationUrl ? (
              <div className="pt-1">
                <a
                  href={event.locationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-700"
                >
                  Join / Open location →
                </a>
              </div>
            ) : null}
          </div>

          {event.description ? (
            <div className="prose prose-sm mt-5 max-w-none dark:prose-invert">
              <ReactMarkdown>{event.description}</ReactMarkdown>
            </div>
          ) : null}

          {isActive ? (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Your RSVP
              </div>
              <RsvpButtons
                eventId={event.id}
                occurrenceStartsAt={occIso}
                initialStatus={myStatus}
                counts={counts}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Attendees</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["GOING", "MAYBE", "DECLINED"] as const).map((s) => (
            <div key={s}>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {s} ({counts[s]})
              </div>
              <ul className="space-y-1">
                {relevantRsvps
                  .filter((r) => r.status === s)
                  .slice(0, 20)
                  .map((r) => (
                    <li key={r.id} className="truncate text-xs">
                      {r.user.name ?? `@${r.user.handle}`}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function sameInstant(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < 60_000; // within a minute
}
