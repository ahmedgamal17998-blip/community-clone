import Link from "next/link";
import { formatTime } from "@/lib/calendar";
import type { ExpandedOccurrence } from "@/server/events";

export function EventDot({
  occ,
  groupSlug,
}: {
  occ: ExpandedOccurrence;
  groupSlug: string;
}) {
  const href = `/groups/${groupSlug}/events/${occ.eventId}?occ=${encodeURIComponent(
    occ.occurrenceStartsAt.toISOString(),
  )}`;
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-[11px] hover:bg-muted"
      style={{ borderLeft: `3px solid ${occ.color}` }}
      title={occ.title}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: occ.color }}
      />
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatTime(occ.occurrenceStartsAt)}
      </span>
      <span className="truncate">{occ.title}</span>
    </Link>
  );
}
