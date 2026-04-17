/**
 * Minimal iCalendar builder (M10). No external deps.
 * Reference: RFC 5545.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date as a UTC iCal timestamp: YYYYMMDDTHHMMSSZ */
export function icsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** Escape iCal TEXT value per RFC 5545 §3.3.11. */
export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Fold long lines at 75 octets per RFC 5545 §3.1. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    const size = i === 0 ? 75 : 74;
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + size));
    i += size;
  }
  return chunks.join("\r\n");
}

export type IcsEventInput = {
  uid: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  url?: string | null;
  location?: string | null;
  recurrence?: "NONE" | "WEEKLY" | string;
  recurrenceEndsAt?: Date | null;
};

export function buildIcs(ev: IcsEventInput): string {
  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//community-clone//M10//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}@community-clone`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(ev.startsAt)}`,
    `DTEND:${icsDate(ev.endsAt)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  if (ev.url) lines.push(`URL:${icsEscape(ev.url)}`);
  if (ev.recurrence === "WEEKLY") {
    let rule = "RRULE:FREQ=WEEKLY";
    if (ev.recurrenceEndsAt) rule += `;UNTIL=${icsDate(ev.recurrenceEndsAt)}`;
    lines.push(rule);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * Booking-specific ICS (M11). Adds ATTENDEE lines + Google Meet X-prop.
 */
export type IcsBookingInput = {
  uid: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  hostEmail: string;
  hostName?: string | null;
  attendees: Array<{ email: string; name?: string | null }>;
  meetLink?: string | null;
  method?: "REQUEST" | "CANCEL" | "PUBLISH";
  status?: "CONFIRMED" | "CANCELLED";
};

export function buildBookingIcs(ev: IcsBookingInput): string {
  const now = new Date();
  const method = ev.method ?? "REQUEST";
  const status = ev.status ?? "CONFIRMED";
  const description = ev.meetLink
    ? `${ev.description ?? ""}${ev.description ? "\n\n" : ""}Join: ${ev.meetLink}`
    : ev.description ?? "";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//community-clone//M11//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${ev.uid}@community-clone`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(ev.startsAt)}`,
    `DTEND:${icsDate(ev.endsAt)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `STATUS:${status}`,
    `SEQUENCE:${status === "CANCELLED" ? 1 : 0}`,
    `ORGANIZER;CN=${icsEscape(ev.hostName ?? ev.hostEmail)}:mailto:${ev.hostEmail}`,
  ];
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  for (const a of ev.attendees) {
    lines.push(
      `ATTENDEE;CN=${icsEscape(a.name ?? a.email)};RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${a.email}`,
    );
  }
  if (ev.meetLink) {
    lines.push(`URL:${icsEscape(ev.meetLink)}`);
    lines.push(`X-GOOGLE-CONFERENCE:${icsEscape(ev.meetLink)}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
