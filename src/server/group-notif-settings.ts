/**
 * Group notification settings — admin-controlled per-group toggles.
 *
 * Controls which event classes generate in-app notifications inside a group.
 * If no config row exists yet, we return and save defaults on first read.
 */
"use server";

import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupNotifSettings {
  adminOnNewMember:      boolean;
  adminOnSubRequest:     boolean;
  memberOnEventReminder: boolean;
  memberOnNewPost:       boolean;
  memberOnAnnouncement:  boolean;
}

const DEFAULT_SETTINGS: GroupNotifSettings = {
  adminOnNewMember:      true,
  adminOnSubRequest:     true,
  memberOnEventReminder: true,
  memberOnNewPost:       false,
  memberOnAnnouncement:  true,
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getGroupNotifSettings(groupId: string): Promise<GroupNotifSettings> {
  const row = await db.groupNotifConfig.findUnique({ where: { groupId } });
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    adminOnNewMember:      row.adminOnNewMember,
    adminOnSubRequest:     row.adminOnSubRequest,
    memberOnEventReminder: row.memberOnEventReminder,
    memberOnNewPost:       row.memberOnNewPost,
    memberOnAnnouncement:  row.memberOnAnnouncement,
  };
}

// ─── Update ───────────────────────────────────────────────────────────────────

const UpdateSchema = z.object({
  adminOnNewMember:      z.boolean(),
  adminOnSubRequest:     z.boolean(),
  memberOnEventReminder: z.boolean(),
  memberOnNewPost:       z.boolean(),
  memberOnAnnouncement:  z.boolean(),
});

export async function updateGroupNotifSettingsAction(
  groupId: string,
  raw: GroupNotifSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  // Must be ADMIN or OWNER of the group
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!membership || membership.state !== "ACTIVE" || !hasMinRole(membership.role as Role, "ADMIN")) {
    // Also allow tenant owner
    const group = await db.group.findUnique({ where: { id: groupId }, select: { tenant: { select: { ownerId: true } } } });
    if (group?.tenant.ownerId !== session.user.id) {
      return { ok: false, error: "Unauthorized" };
    }
  }

  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]!.message };

  await db.groupNotifConfig.upsert({
    where:  { groupId },
    update: parsed.data,
    create: { groupId, ...parsed.data },
  });

  return { ok: true };
}
