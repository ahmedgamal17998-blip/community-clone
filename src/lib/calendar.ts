/**
 * Minimal calendar helpers for M10.
 * No date-fns — native Date + Intl only.
 */

export function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

export function addWeeks(d: Date, weeks: number): Date {
  return addDays(d, weeks * 7);
}

export function addMonths(d: Date, months: number): Date {
  const x = new Date(d.getTime());
  x.setMonth(x.getMonth() + months);
  return x;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Week starts on Sunday. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function endOfWeek(d: Date): Date {
  return endOfDay(addDays(startOfWeek(d), 6));
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function endOfMonth(d: Date): Date {
  const x = startOfMonth(d);
  x.setMonth(x.getMonth() + 1);
  x.setMilliseconds(-1);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isoDate(d: Date): string {
  // YYYY-MM-DD (local)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDateOrToday(s: string | null | undefined): Date {
  if (!s) return startOfDay(new Date());
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return startOfDay(new Date());
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatInTZ(
  date: Date,
  tz: string,
  opts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", opts).format(date);
  }
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Build the month grid: weeks of 7 days spanning the month. */
export function monthGrid(anchor: Date): Date[][] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const last = endOfMonth(anchor);
  const gridEndCandidate = endOfWeek(last);
  const weeks: Date[][] = [];
  let cur = gridStart;
  while (cur <= gridEndCandidate) {
    const w: Date[] = [];
    for (let i = 0; i < 7; i++) {
      w.push(addDays(cur, i));
    }
    weeks.push(w);
    cur = addDays(cur, 7);
  }
  return weeks;
}

/** 7 days starting Sunday of the week containing anchor. */
export function weekDays(anchor: Date): Date[] {
  const s = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function listTimezones(): string[] {
  try {
    const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    if (typeof anyIntl.supportedValuesOf === "function") {
      return anyIntl.supportedValuesOf("timeZone");
    }
  } catch {
    // fall through
  }
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Africa/Cairo",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}
