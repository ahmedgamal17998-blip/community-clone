"use server";

/**
 * M18: Admin actions to grant/revoke per-member access.
 */
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";
import type { ResourceType } from "@/server/access";

/**
 * GRANT access: explicitly allow this user on this resource.
 * Useful for premium content where the default is locked.
 */
export async function grantAccessAction(params: {
  groupId: string;
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
  expiresAt?: Date | null;
  note?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  await db.memberAccess.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId: params.userId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      },
    },
    update: {
      mode: "GRANT",
      expiresAt: params.expiresAt ?? null,
      grantedById: session.user.id,
      note: params.note,
      source: "MANUAL",
    },
    create: {
      userId: params.userId,
      groupId: params.groupId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      mode: "GRANT",
      expiresAt: params.expiresAt ?? null,
      grantedById: session.user.id,
      note: params.note,
      source: "MANUAL",
    },
  });

  revalidatePath(`/groups/[slug]/admin/members/${params.userId}`, "page");
}

/**
 * LOCK (DENY) access: explicitly block this user on this resource even if they
 * would otherwise have access via membership/subscription/group-level grant.
 */
export async function lockAccessAction(params: {
  groupId: string;
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
  expiresAt?: Date | null;
  note?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  await db.memberAccess.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId: params.userId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      },
    },
    update: {
      mode: "DENY",
      expiresAt: params.expiresAt ?? null,
      grantedById: session.user.id,
      note: params.note,
      source: "MANUAL",
    },
    create: {
      userId: params.userId,
      groupId: params.groupId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      mode: "DENY",
      expiresAt: params.expiresAt ?? null,
      grantedById: session.user.id,
      note: params.note,
      source: "MANUAL",
    },
  });

  revalidatePath(`/groups/[slug]/admin/members/${params.userId}`, "page");
}

/**
 * Clear any explicit access record (GRANT or DENY) — falls back to default
 * access rules (membership, subscription, etc.).
 */
export async function revokeAccessAction(params: {
  groupId: string;
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  await db.memberAccess.deleteMany({
    where: {
      userId: params.userId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    },
  });

  revalidatePath(`/groups/[slug]/admin/members/${params.userId}`, "page");
}

export async function setMembershipExpiryAction(params: {
  groupId: string;
  userId: string;
  accessExpiresAt: Date | null;
  lockedAt?: Date | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  await db.groupMembership.update({
    where: {
      groupId_userId: { groupId: params.groupId, userId: params.userId },
    },
    data: {
      accessExpiresAt: params.accessExpiresAt,
      lockedAt: params.lockedAt ?? null,
    },
  });

  revalidatePath(`/groups/[slug]/admin/members/${params.userId}`, "page");
}

/**
 * Manually grant a free-trial-style GROUP-level access GRANT to a member.
 * Used by the admin diagnostic tool — creates / refreshes a row that
 * unlocks every premium resource in the group for `days` days.
 *
 * Same shape as the trial fired automatically on join, but admin-driven.
 */
export async function grantTrialToMemberAction(params: {
  groupId: string;
  userId: string;
  days: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "SUBS_MANAGE",
  });

  if (params.days <= 0 || params.days > 365) {
    return { ok: false as const, error: "Days must be 1–365" };
  }

  const expiresAt = new Date(Date.now() + params.days * 86_400_000);

  try {
    await db.memberAccess.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId: params.userId,
          resourceType: "GROUP",
          resourceId: params.groupId,
        },
      },
      update: {
        mode: "GRANT",
        expiresAt,
        source: "MANUAL",
        grantedById: session.user.id,
        note: `Admin-granted trial (${params.days}d)`,
      },
      create: {
        userId: params.userId,
        groupId: params.groupId,
        resourceType: "GROUP",
        resourceId: params.groupId,
        mode: "GRANT",
        expiresAt,
        source: "MANUAL",
        grantedById: session.user.id,
        note: `Admin-granted trial (${params.days}d)`,
      },
    });
    revalidatePath(`/groups/[slug]/admin/members/${params.userId}`, "page");
    return { ok: true as const, expiresAt };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Failed to grant trial",
    };
  }
}
