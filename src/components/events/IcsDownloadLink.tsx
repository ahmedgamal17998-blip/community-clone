/**
 * Download-to-calendar link. Points at /api/events/[id]/ics which returns
 * text/calendar with a content-disposition attachment header.
 */
import Link from "next/link";

export function IcsDownloadLink({ eventId }: { eventId: string }) {
  return (
    <Link
      href={`/api/events/${eventId}/ics`}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
      prefetch={false}
    >
      Add to calendar
    </Link>
  );
}
