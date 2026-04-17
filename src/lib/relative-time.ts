/**
 * Tiny relative-time formatter. Uses Intl.RelativeTimeFormat so Arabic
 * comes out correct ("منذ ٣ دقائق") without bundling a library.
 */
const UNITS: Array<{ limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { limit: 60,               divisor: 1,           unit: "second" },
  { limit: 60 * 60,          divisor: 60,          unit: "minute" },
  { limit: 60 * 60 * 24,     divisor: 60 * 60,     unit: "hour" },
  { limit: 60 * 60 * 24 * 7, divisor: 60 * 60 * 24, unit: "day" },
  { limit: 60 * 60 * 24 * 30, divisor: 60 * 60 * 24 * 7, unit: "week" },
  { limit: 60 * 60 * 24 * 365, divisor: 60 * 60 * 24 * 30, unit: "month" },
  { limit: Infinity,         divisor: 60 * 60 * 24 * 365, unit: "year" },
];

export function formatRelative(date: Date | string, locale = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const match = UNITS.find((u) => abs < u.limit) ?? UNITS[UNITS.length - 1]!;
  const value = Math.round(diff / match.divisor);
  return rtf.format(value, match.unit);
}
