import { cn } from "@/lib/utils";
import {
  WEEKDAY_SHORT,
  isSameDay,
  monthGrid,
  weekDays,
  formatTime,
} from "@/lib/calendar";
import type { ExpandedOccurrence } from "@/server/events";
import { EventDot } from "./EventDot";

type Props = {
  view: "day" | "week" | "month";
  date: Date;
  occurrences: ExpandedOccurrence[];
  groupSlug: string;
};

export function CalendarGrid({ view, date, occurrences, groupSlug }: Props) {
  if (view === "month") {
    return <MonthView date={date} occurrences={occurrences} groupSlug={groupSlug} />;
  }
  if (view === "week") {
    return <WeekView date={date} occurrences={occurrences} groupSlug={groupSlug} />;
  }
  return <DayView date={date} occurrences={occurrences} groupSlug={groupSlug} />;
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
}: {
  date: Date;
  occurrences: ExpandedOccurrence[];
  groupSlug: string;
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
                  <EventDot key={j} occ={o} groupSlug={groupSlug} />
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
}: {
  date: Date;
  occurrences: ExpandedOccurrence[];
  groupSlug: string;
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
                  <EventDot key={j} occ={o} groupSlug={groupSlug} />
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
}: {
  date: Date;
  occurrences: ExpandedOccurrence[];
  groupSlug: string;
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
            <li
              key={i}
              className="rounded-md border border-border p-3"
              style={{ borderLeft: `4px solid ${o.color}` }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{o.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(o.occurrenceStartsAt)} –{" "}
                    {formatTime(o.occurrenceEndsAt)}
                  </div>
                </div>
                <a
                  href={`/groups/${groupSlug}/events/${o.eventId}?occ=${encodeURIComponent(
                    o.occurrenceStartsAt.toISOString(),
                  )}`}
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  Open →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
