"use server";

/**
 * M18: Admin actions to grant/revoke per-member access.
 */
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";
import type { ResourceType } from "@/server/access";

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
      expiresAt: params.expiresAt ?? null,
      grantedById: session.user.id,
      note: params.note,
      source: "MANUAL",
    },
  });

  revalidatePath(`/groups/[slug]/admin/members/${params.userId}`, "page");
}

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
