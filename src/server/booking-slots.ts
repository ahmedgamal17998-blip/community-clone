/**
 * Availability slot computation (M11).
 *
 *   1. Generate candidates from weekly rules (wall-clock in host TZ)
 *   2. Subtract confirmed Bookings for host
 *   3. Subtract freeBusy windows from Google (if connected)
 *   4. Enforce minNoticeHours + maxPerDay + buffer
 */
import "server-only";
import { db } from "@/server/db";
import { freeBusy } from "@/server/google";
import {
  zonedYMD,
  zonedWallClockToUtc,
  zonedWeekday,
  addDaysZoned,
} from "@/lib/tz";

export type Slot = { startsAt: Date; endsAt: Date };

export type AvailabilityRule = {
  weekday: number; // 0..6 (Sun..Sat)
  startMin: number; // 0..1440
  endMin: number;
};

export function parseRules(raw: string | null | undefined): AvailabilityRule[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (r) =>
          r &&
          typeof r.weekday === "number" &&
          typeof r.startMin === "number" &&
          typeof r.endMin === "number" &&
          r.startMin >= 0 &&
          r.endMin <= 1440 &&
          r.startMin < r.endMin,
      )
      .map((r) => ({
        weekday: Math.max(0, Math.min(6, r.weekday | 0)),
        startMin: r.startMin | 0,
        endMin: r.endMin | 0,
      }));
  } catch {
    return [];
  }
}

export async function computeAvailableSlots(params: {
  hostUserId: string;
  from: Date;
  to: Date;
}): Promise<Slot[]> {
  const availability = await db.availability.findUnique({
    where: { userId: params.hostUserId },
  });
  if (!availability) return [];

  const tz = availability.timezone || "UTC";
  const slotLen = availability.slotLengthMin;
  const buffer = availability.bufferMin;
  const minNotice = availability.minNoticeHours;
  const maxPerDay = availability.maxPerDay;
  const rules = parseRules(availability.rules);
  if (rules.length === 0) return [];

  const now = new Date();
  const earliest = new Date(now.getTime() + minNotice * 60 * 60 * 1000);

  // Generate candidate slots per day in zone.
  const candidates: Slot[] = [];
  const from = params.from < earliest ? earliest : params.from;
  if (from >= params.to) return [];

  // Walk days based on zoned midnight, up to 45 days cap to avoid runaway loops.
  const MAX_DAYS = 45;
  let cursor = addDaysZoned(from, 0, tz); // zoned midnight of `from`
  for (let i = 0; i < MAX_DAYS; i++) {
    if (cursor >= params.to) break;
    const { year, month, day } = zonedYMD(cursor, tz);
    const wd = zonedWeekday(cursor, tz);
    const dayRules = rules.filter((r) => r.weekday === wd);
    for (const rule of dayRules) {
      for (let m = rule.startMin; m + slotLen <= rule.endMin; m += slotLen + buffer) {
        const start = zonedWallClockToUtc(
          year,
          month,
          day,
          Math.floor(m / 60),
          m % 60,
          tz,
        );
        const end = new Date(start.getTime() + slotLen * 60_000);
        if (start < earliest) continue;
        if (start < params.from) continue;
        if (end > params.to) continue;
        candidates.push({ startsAt: start, endsAt: end });
      }
    }
    cursor = addDaysZoned(cursor, 1, tz);
  }

  if (candidates.length === 0) return [];

  // Fetch existing confirmed bookings that overlap the window.
  const existingBookings = await db.booking.findMany({
    where: {
      hostId: params.hostUserId,
      status: "CONFIRMED",
      startsAt: { lt: params.to },
      endsAt: { gt: params.from },
    },
    select: { startsAt: true, endsAt: true },
  });

  // FreeBusy from Google.
  const busy = await freeBusy({
    hostUserId: params.hostUserId,
    timeMin: params.from,
    timeMax: params.to,
  });

  const blockers: Array<{ start: Date; end: Date }> = [
    ...existingBookings.map((b) => ({
      start: new Date(b.startsAt.getTime() - buffer * 60_000),
      end: new Date(b.endsAt.getTime() + buffer * 60_000),
    })),
    ...busy.map((b) => ({ start: b.start, end: b.end })),
  ];

  function overlaps(a: { start: Date; end: Date }, s: Slot): boolean {
    return a.start < s.endsAt && a.end > s.startsAt;
  }

  const filtered = candidates.filter(
    (s) => !blockers.some((b) => overlaps(b, s)),
  );

  // maxPerDay cap.
  const perDayCount = new Map<string, number>();
  const capped: Slot[] = [];
  for (const s of filtered) {
    const { year, month, day } = zonedYMD(s.startsAt, tz);
    const key = `${year}-${month}-${day}`;
    const count = perDayCount.get(key) ?? 0;
    if (count >= maxPerDay) continue;
    perDayCount.set(key, count + 1);
    capped.push(s);
  }

  return capped.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
