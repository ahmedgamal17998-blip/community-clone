/**
 * Event audience CRUD — admin-only.
 *
 * Audience model recap (M23):
 *   • event.audienceMode = ALL → everyone in the group sees the event;
 *     EventAudience rows are ignored.
 *   • event.audienceMode = RESTRICTED → user must match at least one rule.
 *   Rule types: ALL | CHANNEL | COURSE | ROLE_LEVEL | MEMBER
 *
 * Actions:
 *   - setEventAudienceMode(eventId, mode)
 *   - addAudienceRule(eventId, rule)        — appends a row
 *   - removeAudienceRule(ruleId)            — deletes a row
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

async function requireEventAdmin(eventId: string, userId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, groupId: true, group: { select: { slug: true } } },
  });
  if (!event) throw new Error("Event not found");
  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: event.groupId, userId } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    throw new Error("FORBIDDEN");
  }
  return event;
}

// ── Set audience mode ───────────────────────────────────────────────────────

const setModeSchema = z.object({
  eventId: z.string().cuid(),
  mode: z.enum(["ALL", "RESTRICTED"]),
});

export async function setEventAudienceModeAction(input: {
  eventId: string;
  mode: "ALL" | "RESTRICTED";
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const parsed = setModeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const event = await requireEventAdmin(parsed.data.eventId, session.user.id);
  await db.event.update({
    where: { id: parsed.data.eventId },
    data: { audienceMode: parsed.data.mode },
  });
  revalidatePath(`/groups/${event.group.slug}/events`, "page");
  return { ok: true as const };
}

// ── Add a rule ───────────────────────────────────────────────────────────────

const addRuleSchema = z.object({
  eventId: z.string().cuid(),
  type: z.enum(["ALL", "CHANNEL", "COURSE", "ROLE_LEVEL", "MEMBER"]),
  channelId: z.string().cuid().optional().nullable(),
  courseId: z.string().cuid().optional().nullable(),
  minRole: z.enum(["OWNER", "ADMIN", "CONTRIBUTOR", "MEMBER"]).optional().nullable(),
  userId: z.string().cuid().optional().nullable(),
});

export async function addAudienceRuleAction(input: {
  eventId: string;
  type: "ALL" | "CHANNEL" | "COURSE" | "ROLE_LEVEL" | "MEMBER";
  channelId?: string | null;
  courseId?: string | null;
  minRole?: "OWNER" | "ADMIN" | "CONTRIBUTOR" | "MEMBER" | null;
  userId?: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const parsed = addRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Per-type field requirements.
  if (parsed.data.type === "CHANNEL" && !parsed.data.channelId) {
    return { ok: false as const, error: "Channel required" };
  }
  if (parsed.data.type === "COURSE" && !parsed.data.courseId) {
    return { ok: false as const, error: "Course required" };
  }
  if (parsed.data.type === "ROLE_LEVEL" && !parsed.data.minRole) {
    return { ok: false as const, error: "Role required" };
  }
  if (parsed.data.type === "MEMBER" && !parsed.data.userId) {
    return { ok: false as const, error: "Member required" };
  }

  const event = await requireEventAdmin(parsed.data.eventId, session.user.id);

  const created = await db.eventAudience.create({
    data: {
      eventId: parsed.data.eventId,
      type: parsed.data.type,
      channelId: parsed.data.channelId ?? null,
      courseId: parsed.data.courseId ?? null,
      minRole: parsed.data.minRole ?? null,
      userId: parsed.data.userId ?? null,
    },
  });

  revalidatePath(`/groups/${event.group.slug}/events`, "page");
  return { ok: true as const, ruleId: created.id };
}

// ── Remove a rule ────────────────────────────────────────────────────────────

export async function removeAudienceRuleAction(input: { ruleId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const rule = await db.eventAudience.findUnique({
    where: { id: input.ruleId },
    select: { eventId: true },
  });
  if (!rule) return { ok: false as const, error: "Rule not found" };

  const event = await requireEventAdmin(rule.eventId, session.user.id);
  await db.eventAudience.delete({ where: { id: input.ruleId } });
  revalidatePath(`/groups/${event.group.slug}/events`, "page");
  return { ok: true as const };
}
