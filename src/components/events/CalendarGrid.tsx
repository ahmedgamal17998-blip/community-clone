import { cn } from "@/lib/utils";
import {
  WEEKDAY_SHORT,
  isSameDay,
  monthGrid,
  weekDays,
} from "@/lib/calendar";
import type { ExpandedOccurrence } from "@/server/events";
import { EventDot } from "./EventDot";
import { DayRow } from "./DayRow";

type Props = {
  view: "day" | "week" | "month";
  date: Date;
  occurrences: ExpandedOccurrence[];
  groupSlug: string;
  /** Event IDs the viewer can SEE but not ACCESS — rendered dimmed with a
   *  lock icon; click opens the paywall popup. The page is responsible for
   *  computing this set via `eventAccessStates`. */
  lockedEventIds?: Set<string>;
};

export function CalendarGrid({ view, date, occurrences, groupSlug, lockedEventIds }: Props) {
  const locked = lockedEventIds ?? new Set<string>();
  if (view === "month") {
    return <MonthView date={date} occurrences={occurrences} groupSlug={groupSlug} lockedEventIds={locked} />;
  }
  if (view === "week") {
    return <WeekView date={date} occurrences={occurrences} groupSlug={groupSlug} lockedEventIds={locked} />;
  }
  return <DayView date={date} occurrences={occurrences} groupSlug={groupSlug} lockedEventIds={locked} />;
}

function byDay(occurrences: ExpandedOccurrence[]) {
  const map = new Map<string, ExpandedOccurrence[]>();
  for (const o of occurrences) {
    const d = o.occurrenceStartsAt;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const arr = map.get(key) ?? [];
    arr.push(o);
    map.set(key, arr);
  }
  return map;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function MonthView({
  date,
  occurrences,
  groupSlug,
  lockedEventIds,
}: {
  date: Date;
  occurrences: ExpandedOccurrence[];
  groupSlug: string;
  lockedEventIds: Set<string>;
}) {
  const weeks = monthGrid(date);
  const today = new Date();
  const map = byDay(occurrences);
  const currentMonth = date.getMonth();

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border text-xs text-muted-foreground">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="px-2 py-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((d, i) => {
          const isCur = d.getMonth() === currentMonth;
          const isToday = isSameDay(d, today);
          const list = map.get(dayKey(d)) ?? [];
          return (
            <div
              key={i}
              className={cn(
                "min-h-[96px] border-b border-r border-border p-1.5 text-xs",
                !isCur && "bg-muted/30 text-muted-foreground",
                i % 7 === 6 && "border-r-0",
              )}
            >
              <div
                className={cn(
                  "mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((o, j) => (
                  <EventDot
                    key={j}
                    occ={o}
                    groupSlug={groupSlug}
                    locked={lockedEventIds.has(o.eventId)}
                  />
                ))}
                {list.length > 3 ? (
                  <div className="px-1.5 text-[11px] text-muted-foreground">
                    +{list.length - 3} more
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  date,
  occurrences,
  groupSlug,
  lockedEventIds,
}: {
  date: Date;
  occurrences: ExpandedOccurrence[];
  groupSlug: string;
  lockedEventIds: Set<string>;
}) {
  const days = weekDays(date);
  const today = new Date();
  const map = byDay(occurrences);
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border text-xs text-muted-foreground">
        {days.map((d, i) => (
          <div
            key={i}
            className={cn(
              "px-2 py-2 text-center font-medium",
              isSameDay(d, today) && "text-primary",
            )}
          >
            <div>{WEEKDAY_SHORT[d.getDay()]}</div>
            <div className="text-sm">{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = map.get(dayKey(d)) ?? [];
          return (
            <div
              key={i}
              className={cn(
                "min-h-[280px] border-r border-border p-2",
                i === 6 && "border-r-0",
              )}
            >
              <div className="space-y-1">
                {list.map((o, j) => (
                  <EventDot
                    key={j}
                    occ={o}
                    groupSlug={groupSlug}
                    locked={lockedEventIds.has(o.eventId)}
                  />
                ))}
                {list.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/60">—</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  date,
  occurrences,
  groupSlug,
  lockedEventIds,
}: {
  date: Date;
  occurrences: ExpandedOccurrence[];
  groupSlug: string;
  lockedEventIds: Set<string>;
}) {
  const list = occurrences.filter((o) => isSameDay(o.occurrenceStartsAt, date));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">
        {date.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events scheduled.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((o, i) => (
            <DayRow
              key={i}
              occ={o}
              groupSlug={groupSlug}
              locked={lockedEventIds.has(o.eventId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
