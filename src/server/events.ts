/**
 * Events service (M10 + M17 rrule) — queries + server actions.
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { RRule } from "rrule";
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

/**
 * Normalize a recurrence string to a valid rrule string.
 * Legacy values: "NONE" → null, "WEEKLY" → "FREQ=WEEKLY"
 * Anything else is passed through as a raw rrule string.
 */
function normalizeRrule(recurrence: string): string | null {
  if (!recurrence || recurrence === "NONE") return null;
  if (recurrence === "WEEKLY") return "FREQ=WEEKLY";
  return recurrence;
}

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

  const rruleStr = normalizeRrule(event.recurrence);

  if (!rruleStr) {
    push(event.startsAt);
    return out;
  }

  try {
    // Build full rrule string with DTSTART
    const dtstart = event.startsAt;
    const fullStr = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, "").split(".")[0]}Z\nRRULE:${rruleStr}`;
    const rule = RRule.fromString(fullStr);

    // Override UNTIL if recurrenceEndsAt is set and rrule doesn't already have one
    // We expand within window bounds
    const occurrences = rule.between(windowStart, windowEnd, true);
    for (const occ of occurrences) {
      if (event.recurrenceEndsAt && occ > event.recurrenceEndsAt) break;
      push(occ);
    }
  } catch {
    // Fallback: treat as single occurrence if rrule parse fails
    push(event.startsAt);
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
  // recurring (any rrule or legacy WEEKLY) with recurrenceEndsAt null/>= rangeStart.
  const events = await db.event.findMany({
    where: {
      groupId: params.groupId,
      startsAt: { lte: params.rangeEnd },
      OR: [
        { recurrence: "NONE", endsAt: { gte: params.rangeStart } },
        {
          NOT: { recurrence: "NONE" },
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
  // Only events that start within the next `windowDays` days. Default 7 so
  // the rail's "Upcoming" widget shows just the coming week — keeps the
  // list focused (anything farther shows up in the calendar grid above).
  windowDays = 7,
): Promise<ExpandedOccurrence[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const rows = await listEventsForGroup({
    groupId,
    viewerId: _viewerId,
    rangeStart: now,
    rangeEnd: horizon,
  });
  return rows
    .filter((r) => r.occurrenceStartsAt >= now && r.occurrenceStartsAt <= horizon)
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

/** Validate a recurrence value — accepts "NONE", "WEEKLY" (legacy), or any valid rrule string. */
function validateRecurrence(value: string): string {
  if (!value || value === "NONE") return "NONE";
  if (value === "WEEKLY") return "WEEKLY";
  // Try parsing as rrule
  try {
    RRule.fromString(`DTSTART:20240101T000000Z\nRRULE:${value}`);
    return value;
  } catch {
    throw new Error(`Invalid recurrence rule: ${value}`);
  }
}

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
  recurrence: z.string().default("NONE"),
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

  // Accept either "recurrence" (legacy) or "recurrenceRule" (M17 rrule)
  const rawRecurrence = (formData.get("recurrenceRule") as string) || (formData.get("recurrence") as string) || "NONE";
  let recurrenceValue: string;
  try {
    recurrenceValue = validateRecurrence(rawRecurrence);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }

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
    recurrence: recurrenceValue,
    recurrenceEndsAt: formData.get("recurrenceEndsAt") || null,
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Only admins/owners can create events. Regular members can RSVP to
  // events but cannot create them.
  const ok = await isAtLeast({
    groupId: data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });
  if (!ok) return { ok: false as const, error: "FORBIDDEN" };

  const startsAt = toDateOrNull(data.startsAt);
  const endsAt = toDateOrNull(data.endsAt);
  if (!startsAt || !endsAt) return { ok: false as const, error: "Invalid date" };
  if (endsAt <= startsAt) return { ok: false as const, error: "End must be after start" };
  const recurrenceEndsAt = toDateOrNull(data.recurrenceEndsAt ?? null);

  // M30: tier + visibility (only admin can set; non-admin already blocked
  // above, but keep a strict whitelist).
  const rawTier = formData.get("tier");
  const tierVal = rawTier === "PREMIUM" ? "PREMIUM" : "FREE";
  const rawVisibility = formData.get("visibility");
  const visibilityVal =
    rawVisibility === "HIDDEN" ? "HIDDEN" : "LOCKED_VISIBLE";

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
      tier: tierVal,
      visibility: visibilityVal,
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

  // Optional inline audience (admins setting "who can see" while creating).
  const audienceMode = formData.get("audienceMode");
  const audienceRulesRaw = formData.get("audienceRules");
  if (typeof audienceMode === "string" && audienceMode === "RESTRICTED") {
    await db.event.update({
      where: { id: event.id },
      data: { audienceMode: "RESTRICTED" },
    });
  }
  if (typeof audienceRulesRaw === "string" && audienceRulesRaw) {
    try {
      const arr = JSON.parse(audienceRulesRaw);
      if (Array.isArray(arr) && arr.length > 0) {
        // Verify the caller is admin before persisting rules.
        const me = await db.groupMembership.findUnique({
          where: {
            groupId_userId: { groupId: data.groupId, userId: session.user.id },
          },
          select: { role: true, state: true },
        });
        const isAdmin =
          !!me && me.state === "ACTIVE" &&
          (me.role === "OWNER" || me.role === "ADMIN");
        if (isAdmin) {
          await db.eventAudience.createMany({
            data: arr
              .filter((r: { type?: string }) =>
                ["ALL", "CHANNEL", "COURSE", "ROLE_LEVEL", "MEMBER"].includes(
                  r?.type ?? "",
                ),
              )
              .map((r: {
                type: string;
                channelId?: string | null;
                courseId?: string | null;
                minRole?: string | null;
                userId?: string | null;
              }) => ({
                eventId: event.id,
                type: r.type,
                channelId: r.channelId ?? null,
                courseId: r.courseId ?? null,
                minRole: r.minRole ?? null,
                userId: r.userId ?? null,
              })),
          });
        }
      }
    } catch {
      /* ignore malformed audience payload */
    }
  }

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

  const rawRecurrenceU = (formData.get("recurrenceRule") as string) || (formData.get("recurrence") as string) || "NONE";
  let recurrenceValueU: string;
  try {
    recurrenceValueU = validateRecurrence(rawRecurrenceU);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }

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
    recurrence: recurrenceValueU,
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

  // M30: tier + visibility — admin-only field; non-admin already blocked
  // upstream, but keep the strict whitelist.
  const rawTierU = formData.get("tier");
  const tierUpdate =
    rawTierU === "PREMIUM" ? "PREMIUM" : rawTierU === "FREE" ? "FREE" : undefined;
  const rawVisibilityU = formData.get("visibility");
  const visibilityUpdate =
    rawVisibilityU === "HIDDEN"
      ? "HIDDEN"
      : rawVisibilityU === "LOCKED_VISIBLE"
        ? "LOCKED_VISIBLE"
        : undefined;

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
      ...(tierUpdate ? { tier: tierUpdate } : {}),
      ...(visibilityUpdate ? { visibility: visibilityUpdate } : {}),
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

  // M23 audience gate on RSVP — non-admins / non-creators must be in
  // the event's audience.
  const isAdminOrCreator =
    event.creatorId === session.user.id ||
    (await isAtLeast({
      groupId: event.groupId,
      userId: session.user.id,
      min: "ADMIN",
    }));
  if (!isAdminOrCreator) {
    const { canSeeEvent } = await import("@/server/event-access");
    const allowed = await canSeeEvent({
      userId: session.user.id,
      eventId: event.id,
    });
    if (!allowed) return { ok: false as const, error: "AUDIENCE" };
  }

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
