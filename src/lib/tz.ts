/**
 * Tiny timezone helpers used by the booking slot computation.
 *
 * We deliberately avoid a date-fns / luxon dep: we just need the offset of
 * a given IANA zone for a given instant, plus a couple of wall-clock helpers.
 */

/**
 * Returns the offset of `timeZone` at `date` in minutes (east of UTC positive).
 * Implementation trick: we ask Intl for the parts of `date` formatted in the
 * target zone, reconstruct that as a UTC instant, and diff against the
 * original UTC timestamp.
 */
export function getTimezoneOffsetMin(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    hour,
    pick("minute"),
    pick("second"),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Build the UTC instant for a wall-clock time in `timeZone`. */
export function zonedWallClockToUtc(
  year: number,
  month1to12: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // First approximation: treat the wall clock as if it were UTC.
  const guess = new Date(Date.UTC(year, month1to12 - 1, day, hour, minute, 0));
  // Find what that instant looks like in the target zone, then correct.
  const offset = getTimezoneOffsetMin(guess, timeZone);
  return new Date(guess.getTime() - offset * 60_000);
}

/** 0 = Sunday … 6 = Saturday for the *wall-clock* weekday in `timeZone`. */
export function zonedWeekday(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });
  const label = dtf.format(date);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[label] ?? 0;
}

/** Returns Y/M/D (1-indexed month) for a given instant in a zone. */
export function zonedYMD(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

/** Add `days` midnight-to-midnight in a zone — returns the UTC instant. */
export function addDaysZoned(
  date: Date,
  days: number,
  timeZone: string,
): Date {
  const { year, month, day } = zonedYMD(date, timeZone);
  return zonedWallClockToUtc(year, month, day + days, 0, 0, timeZone);
}
