/**
 * Community-level server actions and queries.
 * Isolated here so they're easy to find and extend.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { canCreateGroup } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { Prisma } from "@prisma/client";

// ─── Create community + first group ─────────────────────────────────────────

const CreateSchema = z.object({
  communityName:  z.string().min(2).max(60),
  communitySlug:  z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only"),
  tagline:        z.string().max(120).optional(),
  groupName:      z.string().min(2).max(60),
  groupSlug:      z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only"),
  visibility:     z.enum(["PUBLIC", "PRIVATE", "HIDDEN"]).default("PUBLIC"),
});

export type CreateCommunityInput = z.infer<typeof CreateSchema>;
export type CreateCommunityError = { field?: string; message: string };

export async function createCommunityAction(
  raw: CreateCommunityInput,
): Promise<{ ok: true; groupSlug: string } | { ok: false; error: CreateCommunityError }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: { message: "Not authenticated" } };

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, error: { field: first.path[0]?.toString(), message: first.message } };
  }
  const { communityName, communitySlug, tagline, groupName, groupSlug, visibility } = parsed.data;

  // Uniqueness checks
  const [slugTaken, groupSlugTaken] = await Promise.all([
    db.community.findUnique({ where: { slug: communitySlug }, select: { id: true } }),
    db.group.findUnique({ where: { slug: groupSlug }, select: { id: true } }),
  ]);
  if (slugTaken)      return { ok: false, error: { field: "communitySlug", message: "Community slug already taken" } };
  if (groupSlugTaken) return { ok: false, error: { field: "groupSlug",     message: "Group slug already taken" } };

  // Create everything in one transaction.
  // The pre-checks above are best-effort; the DB unique constraints are the
  // true guard. We catch P2002 to surface a friendly message on race conflicts.
  let groupSlugForRedirect: string;
  try {
    const result = await db.$transaction(async (tx) => {
      const community = await tx.community.create({
        data: {
          slug: communitySlug,
          name: communityName,
          tagline: tagline ?? null,
          ownerId: session.user.id,
        },
      });

      const group = await tx.group.create({
        data: {
          communityId: community.id,
          slug: groupSlug,
          name: groupName,
          visibility,
        },
      });

      // Make the creator OWNER of the group
      await tx.groupMembership.create({
        data: {
          groupId: group.id,
          userId: session.user.id,
          role: "OWNER",
          state: "ACTIVE",
        },
      });

      return { group };
    });
    groupSlugForRedirect = result.group.slug;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Unique constraint violation — a concurrent request claimed the slug.
      const target = String((err.meta as { target?: string[] })?.target ?? "");
      const field = target.includes("communitySlug") || target.includes("slug")
        ? (target.includes("community") ? "communitySlug" : "groupSlug")
        : undefined;
      return { ok: false, error: { field, message: "That URL is already taken — please choose another." } };
    }
    throw err;
  }

  redirect(`/groups/${groupSlugForRedirect}`);
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/** Return communities owned by a user, each with group count. */
export async function getOwnedCommunities(userId: string) {
  return db.community.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { groups: true } },
    },
  });
}

/** Return a community with its public groups. */
export async function getCommunityBySlug(slug: string) {
  return db.community.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, name: true, handle: true, image: true } },
      groups: {
        where: { deletedAt: null, visibility: { in: ["PUBLIC", "PRIVATE"] } },
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { memberships: { where: { state: "ACTIVE" } } } } },
      },
    },
  });
}

/** Guard: can this community create one more group? */
export async function assertCanCreateGroup(communityId: string) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { plan: true, _count: { select: { groups: true } } },
  });
  if (!community) throw new Error("Community not found");
  if (!canCreateGroup(community.plan as Plan, community._count.groups)) {
    throw new Error(
      `Your Free plan is limited to 1 group. Upgrade to Pro to create more.`,
    );
  }
}
