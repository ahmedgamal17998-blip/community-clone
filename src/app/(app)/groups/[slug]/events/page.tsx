import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getGroupForUser } from "@/server/group-queries";
import {
  listEventsForGroup,
  listUpcoming,
  listPast,
} from "@/server/events";
import {
  parseIsoDateOrToday,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "@/lib/calendar";
import { ViewToggle } from "@/components/events/ViewToggle";
import { CalendarGrid } from "@/components/events/CalendarGrid";
import { UpcomingPastPanel } from "@/components/events/UpcomingPastPanel";
import { BookSessionsButton } from "@/components/events/BookSessionsButton";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import {
  eligibleEventsForUser,
  eventAccessStates,
} from "@/server/event-access";
import { hasGroupSubscriptionAccess } from "@/server/access";
import { EventsLockedView } from "@/components/events/EventsLockedView";
import { listOfferingsForViewer } from "@/server/booking-offerings";

type Props = {
  params: { slug: string };
  searchParams?: { view?: string; date?: string };
};

export default async function GroupEventsPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const found = await getGroupForUser(params.slug, session.user.id);
  if (!found) notFound();
  const { group, myMembership } = found;
  const isActive = myMembership?.state === "ACTIVE";
  const isAdmin =
    isActive && hasMinRole(myMembership!.role as Role, "ADMIN");

  // Monetization gate: non-admin members need an active sub / trial to
  // see the Events tab at all. Otherwise we render a dimmed placeholder
  // that opens the paywall on click.
  if (isActive && !isAdmin) {
    const hasSubAccess = await hasGroupSubscriptionAccess({
      userId: session.user.id,
      groupId: found.group.id,
    });
    if (!hasSubAccess) {
      return <EventsLockedView groupSlug={found.group.slug} />;
    }
  }

  const rawView = (searchParams?.view ?? "month").toLowerCase();
  const view = (rawView === "day" || rawView === "week" || rawView === "month"
    ? rawView
    : "month") as "day" | "week" | "month";
  const date = parseIsoDateOrToday(searchParams?.date);

  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === "day") {
    rangeStart = startOfDay(date);
    rangeEnd = endOfDay(date);
  } else if (view === "week") {
    rangeStart = startOfWeek(date);
    rangeEnd = endOfWeek(date);
  } else {
    // month view: include surrounding weeks
    rangeStart = startOfWeek(startOfMonth(date));
    rangeEnd = endOfWeek(endOfMonth(date));
  }

  const [allOccurrences, allUpcoming, allPast, myBookings] = await Promise.all([
    listEventsForGroup({
      groupId: group.id,
      viewerId: session.user.id,
      rangeStart,
      rangeEnd,
    }),
    listUpcoming(group.id, session.user.id, 30),
    listPast(group.id, session.user.id, 30),
    db.booking.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { gte: rangeStart, lte: rangeEnd },
        OR: [
          { hostId: session.user.id },
          { inviteeId: session.user.id },
        ],
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        hostId: true,
      },
      orderBy: { startsAt: "asc" },
      take: 20,
    }),
  ]);

  // M23 audience filter — admins see everything, members see only events
  // their audience rules let through. We compute the eligible set once
  // and trim every list to it.
  const eligibleSet = isAdmin
    ? null
    : new Set(
        await eligibleEventsForUser({
          userId: session.user.id,
          groupId: group.id,
        }),
      );
  const audienceFilteredOccurrences =
    eligibleSet === null
      ? allOccurrences
      : allOccurrences.filter((o) => eligibleSet.has(o.eventId));
  const audienceFilteredUpcoming =
    eligibleSet === null
      ? allUpcoming
      : allUpcoming.filter((e) => eligibleSet.has(e.eventId));
  const audienceFilteredPast =
    eligibleSet === null
      ? allPast
      : allPast.filter((e) => eligibleSet.has(e.eventId));

  // M30 plan-tier filter — for non-admins compute per-event access state
  // (ACCESS / LOCKED / HIDDEN) so the calendar can dim or drop premium
  // events the viewer doesn't have access to. Admins skip this entirely.
  const allEventIds = Array.from(
    new Set([
      ...audienceFilteredOccurrences.map((o) => o.eventId),
      ...audienceFilteredUpcoming.map((e) => e.eventId),
      ...audienceFilteredPast.map((e) => e.eventId),
    ]),
  );
  const accessMap = await eventAccessStates({
    userId: session.user.id,
    groupId: group.id,
    eventIds: allEventIds,
    isAdmin,
  });

  function passesTier(eventId: string): boolean {
    const s = accessMap.get(eventId);
    return s === undefined || s !== "HIDDEN";
  }
  const lockedEventIds = new Set<string>();
  for (const [id, s] of accessMap.entries()) {
    if (s === "LOCKED") lockedEventIds.add(id);
  }

  const occurrences = audienceFilteredOccurrences.filter((o) =>
    passesTier(o.eventId),
  );
  const upcoming = audienceFilteredUpcoming
    .filter((e) => passesTier(e.eventId))
    .slice(0, 10);
  const past = audienceFilteredPast
    .filter((e) => passesTier(e.eventId))
    .slice(0, 10);

  // M31 — booking button. Only render when the admin enabled it AND there's
  // at least one offering the viewer could potentially see (free, or
  // premium-locked-visible, or admin-bypass). The button is dimmed-and-
  // paywalled when every accessible offering requires a plan the viewer
  // doesn't have (every offering returns LOCKED).
  let bookingButton: {
    label: string;
    tooltip: string | null;
    locked: boolean;
  } | null = null;
  const groupBookingExtras = await db.group.findUnique({
    where: { id: group.id },
    select: {
      bookingButtonEnabled: true,
      bookingButtonLabel: true,
      bookingButtonTooltip: true,
    },
  });
  if (groupBookingExtras?.bookingButtonEnabled && session.user) {
    const offerings = await listOfferingsForViewer({
      groupId: group.id,
      userId: session.user.id,
    });
    if (offerings.length > 0) {
      const anyAccess =
        isAdmin || offerings.some((o) => o.state === "ACCESS");
      bookingButton = {
        label: groupBookingExtras.bookingButtonLabel,
        tooltip: groupBookingExtras.bookingButtonTooltip ?? null,
        locked: !anyAccess,
      };
    }
  }

  const title = titleFor(view, date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">
            {group.name} · Events
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle view={view} date={date} />
          {bookingButton ? (
            <BookSessionsButton
              groupSlug={group.slug}
              label={bookingButton.label}
              tooltip={bookingButton.tooltip}
              locked={bookingButton.locked}
            />
          ) : null}
          {isActive && isAdmin ? (
            <Button asChild size="sm">
              <Link href={`/groups/${group.slug}/events/new`}>+ New Event</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <CalendarGrid
            view={view}
            date={date}
            occurrences={occurrences}
            groupSlug={group.slug}
            lockedEventIds={lockedEventIds}
          />
        </div>
        <div className="space-y-4">
          <UpcomingPastPanel
            upcoming={upcoming}
            past={past}
            groupSlug={group.slug}
            lockedEventIds={lockedEventIds}
          />
          {myBookings.length > 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your bookings in view
              </div>
              <ul className="space-y-1.5">
                {myBookings.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/bookings/${b.id}`}
                      className="block rounded-md border border-dashed border-border px-2 py-1 text-xs hover:border-primary"
                    >
                      <div className="font-medium">{b.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {b.startsAt.toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {b.hostId === session.user!.id ? " · hosting" : " · invited"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function titleFor(view: "day" | "week" | "month", date: Date) {
  if (view === "day") {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "week") {
    const s = startOfWeek(date);
    const e = endOfWeek(date);
    return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
