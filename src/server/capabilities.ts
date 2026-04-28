/**
 * M19: Granular admin capability system.
 *
 * OWNER bypasses all checks (always allowed).
 * ADMIN role + an AdminPermission row with the capability string in its
 * JSON-encoded `capabilities` field is required for non-OWNER admins.
 * CONTRIBUTOR / MEMBER never have capabilities.
 */
import { db } from "@/server/db";
import { getMembership, hasMinRole, type Role } from "@/server/permissions";

export const CAPABILITIES = [
  "MEMBERS_ADD",
  "MEMBERS_REMOVE",
  "POSTS_PIN",
  "NOTIFY_SEND",
  "PROFILES_EDIT",
  "SUBS_MANAGE",
  "CROSSPOST",
  "EVENTS_MANAGE",
  "COURSES_MANAGE",
  "BRANDING_EDIT",
  "CHATS_MANAGE",
  "ANNOUNCEMENTS_SEND",
  "ONBOARDING_EDIT",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Returns the effective capability set for a user in a group:
 * - OWNER: all capabilities
 * - ADMIN: union of role-default capabilities + their AdminPermission row
 * - CONTRIBUTOR / MEMBER: []
 * - non-member / non-active: []
 */
export async function getCapabilities(params: {
  userId: string;
  groupId: string;
}): Promise<Capability[]> {
  const m = await getMembership({
    groupId: params.groupId,
    userId: params.userId,
  });
  if (!m || m.state !== "ACTIVE") return [];

  if (m.role === "OWNER") return [...CAPABILITIES];

  if (!hasMinRole(m.role as Role, "ADMIN")) return [];

  // ADMIN — load AdminPermission row, default to all capabilities if no row
  // exists (legacy admins from M12 had blanket access; this preserves it).
  const perm = await db.adminPermission.findUnique({
    where: { groupId_userId: { groupId: params.groupId, userId: params.userId } },
  });
  if (!perm) return [...CAPABILITIES];

  try {
    const arr = JSON.parse(perm.capabilities) as Capability[];
    return arr.filter((c): c is Capability =>
      (CAPABILITIES as readonly string[]).includes(c),
    );
  } catch {
    return [];
  }
}

export async function hasCapability(params: {
  userId: string;
  groupId: string;
  capability: Capability;
}): Promise<boolean> {
  const caps = await getCapabilities(params);
  return caps.includes(params.capability);
}

export async function requireCapability(params: {
  userId: string;
  groupId: string;
  capability: Capability;
}): Promise<void> {
  const ok = await hasCapability(params);
  if (!ok) throw new Error("FORBIDDEN");
}
