/**
 * Permissions helpers for M2.
 *
 * Roles are ranked (higher = more privileged):
 *   OWNER > ADMIN > CONTRIBUTOR > MEMBER
 *
 * State gates visibility (ACTIVE users see & do; REQUESTED/BANNED don't).
 */
import { db } from "@/server/db";

export const ROLES = ["MEMBER", "CONTRIBUTOR", "ADMIN", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

export const STATES = ["REQUESTED", "ACTIVE", "BANNED"] as const;
export type MembershipState = (typeof STATES)[number];

export const VISIBILITIES = ["PUBLIC", "PRIVATE", "HIDDEN"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export function rankOf(role: Role): number {
  return ROLES.indexOf(role);
}

export function hasMinRole(role: Role, min: Role): boolean {
  return rankOf(role) >= rankOf(min);
}

/**
 * Fetch a user's membership in a group.
 * Returns null if the user is not a member.
 */
export async function getMembership(params: { groupId: string; userId: string }) {
  return db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: params.groupId, userId: params.userId },
    },
  });
}

/**
 * True if the user is an ACTIVE member at or above `min` role.
 * Used inline in server components / server actions.
 */
export async function isAtLeast(params: {
  groupId: string;
  userId: string;
  min: Role;
}): Promise<boolean> {
  const m = await getMembership({ groupId: params.groupId, userId: params.userId });
  if (!m) return false;
  if (m.state !== "ACTIVE") return false;
  return hasMinRole(m.role as Role, params.min);
}

/**
 * Throws if the caller is not at least `min`. Use in server actions for
 * state mutations so callers don't have to repeat the guard.
 */
export async function requireRole(params: {
  groupId: string;
  userId: string;
  min: Role;
}): Promise<void> {
  const ok = await isAtLeast(params);
  if (!ok) throw new Error("FORBIDDEN");
}
