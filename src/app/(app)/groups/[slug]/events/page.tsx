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
import { Button } from "@/components/ui/button";

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

  const [occurrences, upcoming, past] = await Promise.all([
    listEventsForGroup({
      groupId: group.id,
      viewerId: session.user.id,
      rangeStart,
      rangeEnd,
    }),
    listUpcoming(group.id, session.user.id, 10),
    listPast(group.id, session.user.id, 10),
  ]);

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
        <div className="flex items-center gap-2">
          <ViewToggle view={view} date={date} />
          {isActive ? (
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
          />
        </div>
        <div>
          <UpcomingPastPanel
            upcoming={upcoming}
            past={past}
            groupSlug={group.slug}
          />
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
