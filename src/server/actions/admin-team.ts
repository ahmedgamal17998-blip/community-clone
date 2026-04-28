"use server";

/**
 * M19: Manage admin team — owner adds/removes admins, sets capabilities.
 */
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/permissions";
import { CAPABILITIES, type Capability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";

export async function addAdminAction(params: {
  groupId: string;
  userId: string;
  capabilities: Capability[];
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  // Only OWNER can manage the admin team
  await requireRole({
    groupId: params.groupId,
    userId: session.user.id,
    min: "OWNER",
  });

  const validCaps = params.capabilities.filter((c): c is Capability =>
    (CAPABILITIES as readonly string[]).includes(c),
  );

  // Promote to ADMIN role + create / update permission row
  await db.groupMembership.update({
    where: {
      groupId_userId: { groupId: params.groupId, userId: params.userId },
    },
    data: { role: "ADMIN" },
  });

  await db.adminPermission.upsert({
    where: {
      groupId_userId: { groupId: params.groupId, userId: params.userId },
    },
    update: { capabilities: JSON.stringify(validCaps) },
    create: {
      groupId: params.groupId,
      userId: params.userId,
      capabilities: JSON.stringify(validCaps),
    },
  });

  revalidatePath(`/groups/[slug]/admin/team`, "page");
}

export async function removeAdminAction(params: {
  groupId: string;
  userId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireRole({
    groupId: params.groupId,
    userId: session.user.id,
    min: "OWNER",
  });

  // Demote back to MEMBER
  await db.groupMembership.update({
    where: {
      groupId_userId: { groupId: params.groupId, userId: params.userId },
    },
    data: { role: "MEMBER" },
  });

  await db.adminPermission.deleteMany({
    where: { groupId: params.groupId, userId: params.userId },
  });

  revalidatePath(`/groups/[slug]/admin/team`, "page");
}

export async function updateCapabilitiesAction(params: {
  groupId: string;
  userId: string;
  capabilities: Capability[];
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireRole({
    groupId: params.groupId,
    userId: session.user.id,
    min: "OWNER",
  });

  const validCaps = params.capabilities.filter((c): c is Capability =>
    (CAPABILITIES as readonly string[]).includes(c),
  );

  await db.adminPermission.upsert({
    where: {
      groupId_userId: { groupId: params.groupId, userId: params.userId },
    },
    update: { capabilities: JSON.stringify(validCaps) },
    create: {
      groupId: params.groupId,
      userId: params.userId,
      capabilities: JSON.stringify(validCaps),
    },
  });

  revalidatePath(`/groups/[slug]/admin/team`, "page");
}

/**
 * Cross-post a single Post to multiple channels at once.
 * Requires CROSSPOST capability (or owner).
 */
export async function crossPostAction(params: {
  groupId: string;
  channelIds: string[];
  title?: string;
  body: string;
  mediaUrls?: string[];
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const { requireCapability } = await import("@/server/capabilities");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "CROSSPOST",
  });

  // Verify all channels belong to this group
  const channels = await db.channel.findMany({
    where: { id: { in: params.channelIds }, groupId: params.groupId },
    select: { id: true },
  });
  if (channels.length !== params.channelIds.length) {
    throw new Error("CHANNEL_MISMATCH");
  }

  const created = await db.$transaction(
    params.channelIds.map((channelId) =>
      db.post.create({
        data: {
          channelId,
          authorId: session.user!.id,
          title: params.title,
          body: params.body,
          mediaUrls: JSON.stringify(params.mediaUrls ?? []),
        },
      }),
    ),
  );

  revalidatePath(`/groups/[slug]`, "page");
  return created;
}
