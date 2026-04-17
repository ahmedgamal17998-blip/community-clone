/**
 * Booking server actions (M11).
 *
 *   - updateAvailabilityAction
 *   - createBookingAction
 *   - cancelBookingAction
 *   - updateGroupBookingPolicyAction
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import {
  createCalendarEventWithMeet,
  cancelCalendarEvent,
} from "@/server/google";
import { computeAvailableSlots } from "@/server/booking-slots";
import { createNotification } from "@/server/notifications";
import {
  sendBookingConfirmation,
  sendBookingCancellation,
} from "@/server/email-booking";

// ─── Availability ──────────────────────────────────────────────────────────

const ruleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1440),
  endMin: z.number().int().min(0).max(1440),
});
const rulesArraySchema = z
  .array(ruleSchema)
  .max(56)
  .superRefine((arr, ctx) => {
    for (const [i, r] of arr.entries()) {
      if (r.startMin >= r.endMin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Rule ${i}: startMin must be < endMin`,
          path: [i],
        });
      }
    }
  });

const availabilitySchema = z.object({
  timezone: z.string().min(1).max(100),
  slotLengthMin: z.number().int().min(15).max(180),
  bufferMin: z.number().int().min(0).max(60),
  minNoticeHours: z.number().int().min(0).max(168),
  maxPerDay: z.number().int().min(1).max(24),
  bookableScope: z.enum(["EVERYONE", "CONTRIBUTORS", "ADMINS"]),
  rules: rulesArraySchema,
});

export async function updateAvailabilityAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const rulesRaw = formData.get("rules");
  let rules: unknown = [];
  if (typeof rulesRaw === "string" && rulesRaw.length) {
    try {
      rules = JSON.parse(rulesRaw);
    } catch {
      return { ok: false as const, error: "Invalid rules JSON" };
    }
  }

  const parsed = availabilitySchema.safeParse({
    timezone: formData.get("timezone"),
    slotLengthMin: Number(formData.get("slotLengthMin") ?? 30),
    bufferMin: Number(formData.get("bufferMin") ?? 0),
    minNoticeHours: Number(formData.get("minNoticeHours") ?? 4),
    maxPerDay: Number(formData.get("maxPerDay") ?? 6),
    bookableScope: formData.get("bookableScope") ?? "EVERYONE",
    rules,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }

  const data = {
    timezone: parsed.data.timezone,
    slotLengthMin: parsed.data.slotLengthMin,
    bufferMin: parsed.data.bufferMin,
    minNoticeHours: parsed.data.minNoticeHours,
    maxPerDay: parsed.data.maxPerDay,
    bookableScope: parsed.data.bookableScope,
    rules: JSON.stringify(parsed.data.rules),
  };

  await db.availability.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  });
  revalidatePath("/settings/availability");
  return { ok: true as const };
}

// ─── Create booking ────────────────────────────────────────────────────────

const createBookingSchema = z.object({
  hostHandle: z.string().min(1).max(100),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  groupId: z.string().cuid().optional().nullable(),
});

export async function createBookingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "UNAUTHENTICATED" };

  const parsed = createBookingSchema.safeParse({
    hostHandle: formData.get("hostHandle"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    title: formData.get("title"),
    description: formData.get("description") ?? null,
    groupId: formData.get("groupId") || null,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }

  const handle = parsed.data.hostHandle.replace(/^@/, "").toLowerCase();
  const host = await db.user.findFirst({
    where: { handle: { equals: handle, mode: "insensitive" } },
    select: { id: true, name: true, email: true, handle: true, availability: true },
  });
  if (!host) return { ok: false as const, error: "Host not found" };
  if (!host.availability) {
    return { ok: false as const, error: "Host has no availability set" };
  }
  if (!host.email) {
    return { ok: false as const, error: "Host has no email" };
  }
  if (host.id === session.user.id) {
    return { ok: false as const, error: "You cannot book yourself" };
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return { ok: false as const, error: "Invalid time range" };
  }

  // Validate slot is still in the available list for a narrow window.
  const windowStart = new Date(startsAt.getTime() - 60 * 1000);
  const windowEnd = new Date(endsAt.getTime() + 60 * 1000);
  const avail = await computeAvailableSlots({
    hostUserId: host.id,
    from: windowStart,
    to: windowEnd,
  });
  const match = avail.find(
    (s) =>
      s.startsAt.getTime() === startsAt.getTime() &&
      s.endsAt.getTime() === endsAt.getTime(),
  );
  if (!match) {
    return { ok: false as const, error: "Slot no longer available" };
  }

  const invitee = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true },
  });
  if (!invitee?.email) {
    return { ok: false as const, error: "Your account has no email" };
  }

  const booking = await db.booking.create({
    data: {
      hostId: host.id,
      inviteeId: invitee.id,
      inviteeEmail: invitee.email,
      inviteeName: invitee.name ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      startsAt,
      endsAt,
      timezone: host.availability.timezone,
      status: "CONFIRMED",
      groupId: parsed.data.groupId ?? null,
    },
  });

  // Fire Google Calendar insert (best-effort).
  const gcal = await createCalendarEventWithMeet({
    hostUserId: host.id,
    startsAt,
    endsAt,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    timezone: host.availability.timezone,
    attendees: [
      { email: invitee.email, name: invitee.name ?? null },
    ],
    inviteeSendUpdates: true,
  });

  if (gcal) {
    await db.booking.update({
      where: { id: booking.id },
      data: {
        googleEventId: gcal.eventId,
        googleCalendarId: gcal.calendarId,
        meetLink: gcal.meetLink,
        meetConferenceId: gcal.conferenceId,
      },
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[booking] Google event creation failed for booking ${booking.id}`);
  }

  // Emails
  try {
    await sendBookingConfirmation({
      booking: {
        id: booking.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        startsAt,
        endsAt,
        meetLink: gcal?.meetLink ?? null,
        timezone: host.availability.timezone,
      },
      host: { email: host.email, name: host.name },
      invitee: { email: invitee.email, name: invitee.name },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Booking email failed", err);
  }

  await createNotification({
    userId: host.id,
    actorId: invitee.id,
    type: "BOOKING_CREATED",
    snippet: `${invitee.name ?? invitee.email} booked: ${parsed.data.title}`,
    href: `/bookings/${booking.id}`,
    groupId: parsed.data.groupId ?? null,
  });

  revalidatePath(`/profile/${host.handle}/book`);
  return { ok: true as const, bookingId: booking.id };
}

// ─── Cancel booking ────────────────────────────────────────────────────────

const cancelSchema = z.object({
  bookingId: z.string().cuid(),
  reason: z.string().max(500).optional().nullable(),
});

export async function cancelBookingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "UNAUTHENTICATED" };

  const parsed = cancelSchema.safeParse({
    bookingId: formData.get("bookingId"),
    reason: formData.get("reason") ?? null,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }

  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: {
      host: { select: { id: true, name: true, email: true } },
      invitee: { select: { id: true, name: true, email: true } },
    },
  });
  if (!booking) return { ok: false as const, error: "Not found" };
  if (booking.status === "CANCELLED") return { ok: true as const };

  const me = session.user.id;
  const isHost = booking.hostId === me;
  const isInvitee = booking.inviteeId === me;
  if (!isHost && !isInvitee) {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  await db.booking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED",
      cancelReason: parsed.data.reason ?? null,
      cancelledAt: new Date(),
      cancelledById: me,
    },
  });

  if (booking.googleEventId) {
    await cancelCalendarEvent({
      hostUserId: booking.hostId,
      eventId: booking.googleEventId,
      calendarId: booking.googleCalendarId ?? "primary",
    });
  }

  if (booking.host.email && booking.invitee?.email) {
    try {
      await sendBookingCancellation({
        booking: {
          id: booking.id,
          title: booking.title,
          description: booking.description,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          meetLink: booking.meetLink,
          timezone: booking.timezone,
          cancelReason: parsed.data.reason ?? null,
        },
        host: { email: booking.host.email, name: booking.host.name },
        invitee: { email: booking.invitee.email, name: booking.invitee.name },
        cancelledBy: isHost ? "HOST" : "INVITEE",
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Booking cancel email failed", err);
    }
  }

  // Notify the other side
  const otherId = isHost ? booking.inviteeId : booking.hostId;
  if (otherId) {
    await createNotification({
      userId: otherId,
      actorId: me,
      type: "BOOKING_CANCELLED",
      snippet: `Booking cancelled: ${booking.title}`,
      href: `/bookings/${booking.id}`,
      groupId: booking.groupId ?? null,
    });
  }

  revalidatePath(`/bookings/${booking.id}`);
  return { ok: true as const };
}

// ─── Group booking policy ──────────────────────────────────────────────────

const groupPolicySchema = z.object({
  groupId: z.string().cuid(),
  whoCanBeBooked: z.enum(["EVERYONE", "CONTRIBUTORS_PLUS", "ADMINS_ONLY"]),
});

export async function updateGroupBookingPolicyAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "UNAUTHENTICATED" };

  const parsed = groupPolicySchema.safeParse({
    groupId: formData.get("groupId"),
    whoCanBeBooked: formData.get("whoCanBeBooked"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: {
        groupId: parsed.data.groupId,
        userId: session.user.id,
      },
    },
  });
  if (
    !membership ||
    membership.state !== "ACTIVE" ||
    !hasMinRole(membership.role as Role, "ADMIN")
  ) {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  await db.groupBookingPolicy.upsert({
    where: { groupId: parsed.data.groupId },
    update: { whoCanBeBooked: parsed.data.whoCanBeBooked },
    create: {
      groupId: parsed.data.groupId,
      whoCanBeBooked: parsed.data.whoCanBeBooked,
    },
  });

  revalidatePath(`/groups`);
  return { ok: true as const };
}
