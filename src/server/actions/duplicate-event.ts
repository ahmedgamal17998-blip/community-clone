/**
 * Duplicate an event — copies every field, the recurrence, and ALL audience
 * rules. The new event opens at /events/<id>/edit so the admin can adjust
 * the date/title before announcing it.
 *
 * Admin/owner only. Title gets " (Copy)" appended so it's distinguishable.
 */
"use server";

import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

export async function duplicateEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) throw new Error("Missing eventId");

  const original = await db.event.findUnique({
    where: { id: eventId },
    include: { audiences: true },
  });
  if (!original) throw new Error("Event not found");

  // Admin gate.
  const me = await db.groupMembership.findUnique({
    where: {
      groupId_userId: {
        groupId: original.groupId,
        userId: session.user.id,
      },
    },
    select: { role: true, state: true },
  });
  if (
    !me ||
    me.state !== "ACTIVE" ||
    (!hasMinRole(me.role as Role, "ADMIN") && original.creatorId !== session.user.id)
  ) {
    throw new Error("FORBIDDEN");
  }

  // Resolve the group slug for the redirect.
  const group = await db.group.findUnique({
    where: { id: original.groupId },
    select: { slug: true },
  });
  if (!group) throw new Error("Group not found");

  const copy = await db.event.create({
    data: {
      groupId: original.groupId,
      creatorId: session.user.id,
      title: `${original.title} (Copy)`,
      description: original.description,
      startsAt: original.startsAt,
      endsAt: original.endsAt,
      timezone: original.timezone,
      color: original.color,
      category: original.category,
      locationUrl: original.locationUrl,
      recurrence: original.recurrence,
      recurrenceEndsAt: original.recurrenceEndsAt,
      audienceMode: original.audienceMode,
    },
  });

  // Copy audience rules.
  if (original.audiences.length > 0) {
    await db.eventAudience.createMany({
      data: original.audiences.map((a) => ({
        eventId: copy.id,
        type: a.type,
        channelId: a.channelId,
        courseId: a.courseId,
        minRole: a.minRole,
        userId: a.userId,
      })),
    });
  }

  redirect(`/groups/${group.slug}/events/${copy.id}/edit`);
}
