/**
 * Read-only group queries used across pages.
 * Centralized so the shape stays consistent and cacheable.
 */
import { db } from "@/server/db";

/** A lightweight shape for sidebars / switchers. */
export type GroupListItem = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryHsl: string;
  role: string;
  state: string;
};

/** Groups this user belongs to — ACTIVE + REQUESTED. Ordered by joinedAt desc. */
export async function listMyGroups(userId: string): Promise<GroupListItem[]> {
  const rows = await db.groupMembership.findMany({
    where: { userId, state: { in: ["ACTIVE", "REQUESTED"] } },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      state: true,
      group: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          primaryHsl: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.group.id,
    slug: r.group.slug,
    name: r.group.name,
    logoUrl: r.group.logoUrl,
    primaryHsl: r.group.primaryHsl,
    role: r.role,
    state: r.state,
  }));
}

/** Public / discoverable groups the user is NOT yet in. */
export async function listDiscoverableGroups(userId: string) {
  const myIds = (
    await db.groupMembership.findMany({
      where: { userId },
      select: { groupId: true },
    })
  ).map((m) => m.groupId);

  return db.group.findMany({
    where: {
      active: true,
      visibility: { in: ["PUBLIC", "PRIVATE"] },
      id: { notIn: myIds },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      logoUrl: true,
      primaryHsl: true,
      visibility: true,
      _count: { select: { memberships: { where: { state: "ACTIVE" } } } },
    },
  });
}

/** Full group record for the shell layout + my membership (if any). */
export async function getGroupForUser(slug: string, userId: string | undefined) {
  const group = await db.group.findUnique({
    where: { slug },
    include: {
      community: { select: { id: true, name: true, slug: true } },
      _count: { select: { memberships: { where: { state: "ACTIVE" } } } },
    },
  });
  if (!group) return null;

  const myMembership = userId
    ? await db.groupMembership.findUnique({
        where: { groupId_userId: { groupId: group.id, userId } },
      })
    : null;

  return { group, myMembership };
}
