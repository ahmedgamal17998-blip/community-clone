/**
 * Events service (M10) — queries + server actions.
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isAtLeast, hasMinRole, type Role } from "@/server/permissions";
import { createNotification } from "@/server/notifications";

export type ExpandedOccurrence = {
  eventId: string;
  occurrenceStartsAt: Date;
  occurrenceEndsAt: Date;
  title: string;
  color: string;
  category: string | null;
  locationUrl: string | null;
  creatorId: string;
  recurrence: string;
  timezone: string;
};

type EventRow = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  color: string;
  category: string | null;
  locationUrl: string | null;
  creatorId: string;
  recurrence: string;
  recurrenceEndsAt: Date | null;
  timezone: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Expand a single event into occurrences that overlap [windowStart, windowEnd]. */
export async function expandOccurrences(
  event: EventRow,
  windowStart: Date,
  windowEnd: Date,
): Promise<ExpandedOccurrence[]> {
  const duration = event.endsAt.getTime() - event.startsAt.getTime();
  const out: ExpandedOccurrence[] = [];

  const push = (s: Date) => {
    const e = new Date(s.getTime() + duration);
    if (e < windowStart) return;
    if (s > windowEnd) return;
    out.push({
      eventId: event.id,
      occurrenceStartsAt: s,
      occurrenceEndsAt: e,
      title: event.title,
      color: event.color,
      category: event.category,
      locationUrl: event.locationUrl,
      creatorId: event.creatorId,
      recurrence: event.recurrence,
      timezone: event.timezone,
    });
  };

  if (event.recurrence !== "WEEKLY") {
    push(event.startsAt);
    return out;
  }

  // Weekly: iterate forward from startsAt. Stop at recurrenceEndsAt or windowEnd.
  const hardEnd = event.recurrenceEndsAt ?? null;
  let cursor = new Date(event.startsAt.getTime());

  // Fast-forward into the window
  if (cursor.getTime() + duration < windowStart.getTime()) {
    const deltaMs = windowStart.getTime() - (cursor.getTime() + duration);
    const skipWeeks = Math.floor(deltaMs / WEEK_MS);
    if (skipWeeks > 0) cursor = new Date(cursor.getTime() + skipWeeks * WEEK_MS);
  }

  let guard = 0;
  while (cursor <= windowEnd) {
    if (hardEnd && cursor > hardEnd) break;
    push(cursor);
    cursor = new Date(cursor.getTime() + WEEK_MS);
    if (++guard > 520) break; // 10 years safety cap
  }
  return out;
}

async function assertActive(groupId: string, userId: string) {
  const m = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!m || m.state !== "ACTIVE") throw new Error("FORBIDDEN");
  return m;
}

// ─── Queries ───────────────────────────────────────────────────────────────

export async function listEventsForGroup(params: {
  groupId: string;
  viewerId: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<ExpandedOccurrence[]> {
  // Pull events whose base window *could* intersect: any event that started
  // before rangeEnd, and either non-recurring with endsAt >= rangeStart, or
  // weekly with recurrenceEndsAt null/>= rangeStart.
  const events = await db.event.findMany({
    where: {
      groupId: params.groupId,
      startsAt: { lte: params.rangeEnd },
      OR: [
        { recurrence: "NONE", endsAt: { gte: params.rangeStart } },
        {
          recurrence: "WEEKLY",
          OR: [
            { recurrenceEndsAt: null },
            { recurrenceEndsAt: { gte: params.rangeStart } },
          ],
        },
      ],
    },
    orderBy: { startsAt: "asc" },
  });

  const all: ExpandedOccurrence[] = [];
  for (const ev of events) {
    const expanded = await expandOccurrences(ev, params.rangeStart, params.rangeEnd);
    all.push(...expanded);
  }
  all.sort((a, b) => a.occurrenceStartsAt.getTime() - b.occurrenceStartsAt.getTime());
  return all;
}

export async function listUpcoming(
  groupId: string,
  _viewerId: string,
  limit = 10,
): Promise<ExpandedOccurrence[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const rows = await listEventsForGroup({
    groupId,
    viewerId: _viewerId,
    rangeStart: now,
    rangeEnd: horizon,
  });
  return rows
    .filter((r) => r.occurrenceStartsAt >= now)
    .slice(0, limit);
}

export async function listPast(
  groupId: string,
  _viewerId: string,
  limit = 10,
): Promise<ExpandedOccurrence[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const rows = await listEventsForGroup({
    groupId,
    viewerId: _viewerId,
    rangeStart: start,
    rangeEnd: now,
  });
  return rows
    .filter((r) => r.occurrenceStartsAt < now)
    .sort((a, b) => b.occurrenceStartsAt.getTime() - a.occurrenceStartsAt.getTime())
    .slice(0, limit);
}

export async function getEvent(params: { eventId: string; viewerId: string }) {
  const event = await db.event.findUnique({
    where: { id: params.eventId },
    include: {
      creator: { select: { id: true, name: true, handle: true, image: true } },
      group: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!event) return null;

  const rsvps = await db.eventRSVP.findMany({
    where: { eventId: event.id },
    include: {
      user: { select: { id: true, name: true, handle: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return { event, rsvps };
}

export async function getUserUpcomingRSVPs(userId: string, limit = 10) {
  const now = new Date();
  const rsvps = await db.eventRSVP.findMany({
    where: {
      userId,
      status: "GOING",
      OR: [
        { occurrenceStartsAt: { gte: now } },
        { AND: [{ occurrenceStartsAt: null }, { event: { startsAt: { gte: now } } }] },
      ],
    },
    include: {
      event: { select: { id: true, title: true, startsAt: true, color: true, groupId: true } },
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
  return rsvps;
}

// ─── Mutations ─────────────────────────────────────────────────────────────

const createSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(8000).optional().nullable(),
  startsAt: z.string().min(1), // ISO
  endsAt: z.string().min(1),
  timezone: z.string().min(1).max(64).default("UTC"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6d56f0"),
  category: z.string().max(64).optional().nullable(),
  locationUrl: z.string().url().max(500).optional().nullable(),
  recurrence: z.enum(["NONE", "WEEKLY"]).default("NONE"),
  recurrenceEndsAt: z.string().optional().nullable(),
});

function toDateOrNull(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function createEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const raw = {
    groupId: formData.get("groupId"),
    title: formData.get("title"),
    description: formData.get("description") || null,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    timezone: formData.get("timezone") || "UTC",
    color: formData.get("color") || "#6d56f0",
    category: formData.get("category") || null,
    locationUrl: formData.get("locationUrl") || null,
    recurrence: formData.get("recurrence") || "NONE",
    recurrenceEndsAt: formData.get("recurrenceEndsAt") || null,
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const ok = await isAtLeast({
    groupId: data.groupId,
    userId: session.user.id,
    min: "MEMBER",
  });
  if (!ok) return { ok: false as const, error: "FORBIDDEN" };

  const startsAt = toDateOrNull(data.startsAt);
  const endsAt = toDateOrNull(data.endsAt);
  if (!startsAt || !endsAt) return { ok: false as const, error: "Invalid date" };
  if (endsAt <= startsAt) return { ok: false as const, error: "End must be after start" };
  const recurrenceEndsAt = toDateOrNull(data.recurrenceEndsAt ?? null);

  const event = await db.event.create({
    data: {
      groupId: data.groupId,
      creatorId: session.user.id,
      title: data.title,
      description: data.description ?? null,
      startsAt,
      endsAt,
      timezone: data.timezone,
      color: data.color,
      category: data.category ?? null,
      locationUrl: data.locationUrl ?? null,
      recurrence: data.recurrence,
      recurrenceEndsAt,
    },
  });

  // Auto-RSVP creator as GOING
  await db.eventRSVP.create({
    data: {
      eventId: event.id,
      userId: session.user.id,
      status: "GOING",
      occurrenceStartsAt: null,
    },
  });

  // Notify active group members
  const group = await db.group.findUnique({
    where: { id: data.groupId },
    select: { slug: true },
  });
  if (group) {
    const members = await db.groupMembership.findMany({
      where: { groupId: data.groupId, state: "ACTIVE" },
      select: { userId: true },
    });
    const href = `/groups/${group.slug}/events/${event.id}`;
    await Promise.all(
      members.map((m) =>
        createNotification({
          userId: m.userId,
          actorId: session.user!.id,
          type: "EVENT_CREATED",
          groupId: data.groupId,
          snippet: event.title,
          href,
        }).catch(() => null),
      ),
    );
    revalidatePath(`/groups/${group.slug}/events`);
  }

  return { ok: true as const, id: event.id, groupSlug: group?.slug };
}

const updateSchema = createSchema.extend({
  eventId: z.string().min(1),
});

export async function updateEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const raw = {
    eventId: formData.get("eventId"),
    groupId: formData.get("groupId"),
    title: formData.get("title"),
    description: formData.get("description") || null,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    timezone: formData.get("timezone") || "UTC",
    color: formData.get("color") || "#6d56f0",
    category: formData.get("category") || null,
    locationUrl: formData.get("locationUrl") || null,
    recurrence: formData.get("recurrence") || "NONE",
    recurrenceEndsAt: formData.get("recurrenceEndsAt") || null,
  };
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const event = await db.event.findUnique({ where: { id: data.eventId } });
  if (!event) return { ok: false as const, error: "NOT_FOUND" };

  const m = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: event.groupId, userId: session.user.id } },
  });
  const isAdmin = m && m.state === "ACTIVE" && hasMinRole(m.role as Role, "ADMIN");
  if (!isAdmin && event.creatorId !== session.user.id) {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  const startsAt = toDateOrNull(data.startsAt);
  const endsAt = toDateOrNull(data.endsAt);
  if (!startsAt || !endsAt) return { ok: false as const, error: "Invalid date" };
  if (endsAt <= startsAt) return { ok: false as const, error: "End must be after start" };

  await db.event.update({
    where: { id: event.id },
    data: {
      title: data.title,
      description: data.description ?? null,
      startsAt,
      endsAt,
      timezone: data.timezone,
      color: data.color,
      category: data.category ?? null,
      locationUrl: data.locationUrl ?? null,
      recurrence: data.recurrence,
      recurrenceEndsAt: toDateOrNull(data.recurrenceEndsAt ?? null),
    },
  });

  const group = await db.group.findUnique({
    where: { id: event.groupId },
    select: { slug: true },
  });
  if (group) {
    revalidatePath(`/groups/${group.slug}/events`);
    revalidatePath(`/groups/${group.slug}/events/${event.id}`);
  }
  return { ok: true as const, id: event.id, groupSlug: group?.slug };
}

const deleteSchema = z.object({ eventId: z.string().min(1) });

export async function deleteEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const parsed = deleteSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };

  const event = await db.event.findUnique({ where: { id: parsed.data.eventId } });
  if (!event) return { ok: false as const, error: "NOT_FOUND" };

  const m = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: event.groupId, userId: session.user.id } },
  });
  const isAdmin = m && m.state === "ACTIVE" && hasMinRole(m.role as Role, "ADMIN");
  if (!isAdmin && event.creatorId !== session.user.id) {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  const group = await db.group.findUnique({
    where: { id: event.groupId },
    select: { slug: true },
  });
  await db.event.delete({ where: { id: event.id } });
  if (group) {
    revalidatePath(`/groups/${group.slug}/events`);
    redirect(`/groups/${group.slug}/events`);
  }
  return { ok: true as const };
}

const rsvpSchema = z.object({
  eventId: z.string().min(1),
  status: z.enum(["GOING", "MAYBE", "DECLINED"]),
  occurrenceStartsAt: z.string().optional().nullable(),
});

export async function rsvpEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const parsed = rsvpSchema.safeParse({
    eventId: formData.get("eventId"),
    status: formData.get("status"),
    occurrenceStartsAt: formData.get("occurrenceStartsAt") || null,
  });
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };

  const event = await db.event.findUnique({ where: { id: parsed.data.eventId } });
  if (!event) return { ok: false as const, error: "NOT_FOUND" };

  const active = await isAtLeast({
    groupId: event.groupId,
    userId: session.user.id,
    min: "MEMBER",
  });
  if (!active) return { ok: false as const, error: "FORBIDDEN" };

  const occ = toDateOrNull(parsed.data.occurrenceStartsAt ?? null);

  // Prisma's compound-unique where doesn't accept null for nullable cols, so
  // do a manual find → update/create.
  const existing = await db.eventRSVP.findFirst({
    where: {
      eventId: event.id,
      userId: session.user.id,
      occurrenceStartsAt: occ,
    },
  });
  if (existing) {
    await db.eventRSVP.update({
      where: { id: existing.id },
      data: { status: parsed.data.status },
    });
  } else {
    await db.eventRSVP.create({
      data: {
        eventId: event.id,
        userId: session.user.id,
        status: parsed.data.status,
        occurrenceStartsAt: occ,
      },
    });
  }

  const group = await db.group.findUnique({
    where: { id: event.groupId },
    select: { slug: true },
  });
  if (group) {
    revalidatePath(`/groups/${group.slug}/events/${event.id}`);
    revalidatePath(`/groups/${group.slug}/events`);
  }
  return { ok: true as const };
}
