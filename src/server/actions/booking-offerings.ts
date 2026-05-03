"use server";

/**
 * M31 — Booking offering admin actions.
 *
 * CRUD for the BookingOffering rows that describe which Booky event types
 * this group exposes, plus a group-settings updater for the "Book sessions"
 * button label / tooltip / enabled toggle.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/permissions";

async function getGroupSlug(groupId: string): Promise<string | null> {
  const g = await db.group.findUnique({
    where: { id: groupId },
    select: { slug: true },
  });
  return g?.slug ?? null;
}

const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

const createSchema = z.object({
  groupId: z.string().cuid(),
  label: z.string().trim().min(2).max(80),
  tooltipText: z.string().trim().max(300).optional().nullable(),
  instructorSlug: z.string().trim().min(1).max(80).regex(slugRegex),
  eventSlug: z.string().trim().min(1).max(80).regex(slugRegex),
  tier: z.enum(["FREE", "PREMIUM"]).optional(),
  visibility: z.enum(["LOCKED_VISIBLE", "HIDDEN"]).optional(),
});

export async function createBookingOfferingAction(
  input: z.infer<typeof createSchema>,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  const last = await db.bookingOffering.findFirst({
    where: { groupId: parsed.data.groupId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await db.bookingOffering.create({
    data: {
      groupId: parsed.data.groupId,
      label: parsed.data.label,
      tooltipText: parsed.data.tooltipText ?? null,
      instructorSlug: parsed.data.instructorSlug,
      eventSlug: parsed.data.eventSlug,
      tier: parsed.data.tier ?? "FREE",
      // PREMIUM offerings default to LOCKED_VISIBLE; FREE offerings keep
      // the column at its harmless default.
      visibility: parsed.data.visibility ?? "LOCKED_VISIBLE",
      position: (last?.position ?? -1) + 1,
    },
  });

  const slug = await getGroupSlug(parsed.data.groupId);
  if (slug) revalidatePath(`/groups/${slug}/admin/booking`);
  return { ok: true as const };
}

const updateSchema = createSchema
  .partial()
  .extend({
    offeringId: z.string().cuid(),
    groupId: z.string().cuid(),
    archived: z.boolean().optional(),
  });

export async function updateBookingOfferingAction(
  input: z.infer<typeof updateSchema>,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  // Ensure offering belongs to the group.
  const existing = await db.bookingOffering.findUnique({
    where: { id: parsed.data.offeringId },
    select: { groupId: true },
  });
  if (!existing || existing.groupId !== parsed.data.groupId) {
    return { ok: false as const, error: "Offering not found" };
  }

  await db.bookingOffering.update({
    where: { id: parsed.data.offeringId },
    data: {
      label: parsed.data.label,
      tooltipText: parsed.data.tooltipText ?? undefined,
      instructorSlug: parsed.data.instructorSlug,
      eventSlug: parsed.data.eventSlug,
      tier: parsed.data.tier,
      visibility: parsed.data.visibility,
      archived: parsed.data.archived,
    },
  });

  const slug = await getGroupSlug(parsed.data.groupId);
  if (slug) {
    revalidatePath(`/groups/${slug}/admin/booking`);
    revalidatePath(`/groups/${slug}/book`);
  }
  return { ok: true as const };
}

export async function deleteBookingOfferingAction(input: {
  groupId: string;
  offeringId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireRole({
    groupId: input.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });
  const existing = await db.bookingOffering.findUnique({
    where: { id: input.offeringId },
    select: { groupId: true },
  });
  if (!existing || existing.groupId !== input.groupId) return;

  await db.bookingOffering.delete({ where: { id: input.offeringId } });
  // Drop any PlanResource rows that referenced this offering so plans
  // don't carry dangling links.
  await db.planResource.deleteMany({
    where: { resourceType: "BOOKING_OFFERING", resourceId: input.offeringId },
  });
  // Same for any MemberAccess GRANT/DENY rows.
  await db.memberAccess.deleteMany({
    where: { resourceType: "BOOKING_OFFERING", resourceId: input.offeringId },
  });

  const slug = await getGroupSlug(input.groupId);
  if (slug) revalidatePath(`/groups/${slug}/admin/booking`);
}

const settingsSchema = z.object({
  groupId: z.string().cuid(),
  bookingButtonEnabled: z.boolean().optional(),
  bookingButtonLabel: z.string().trim().min(2).max(40).optional(),
  bookingButtonTooltip: z.string().trim().max(300).optional().nullable(),
});

export async function updateBookingButtonSettingsAction(
  input: z.infer<typeof settingsSchema>,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.group.update({
    where: { id: parsed.data.groupId },
    data: {
      bookingButtonEnabled: parsed.data.bookingButtonEnabled,
      bookingButtonLabel: parsed.data.bookingButtonLabel,
      bookingButtonTooltip: parsed.data.bookingButtonTooltip ?? undefined,
    },
  });

  const slug = await getGroupSlug(parsed.data.groupId);
  if (slug) {
    revalidatePath(`/groups/${slug}/admin/booking`);
    revalidatePath(`/groups/${slug}/events`);
  }
  return { ok: true as const };
}
