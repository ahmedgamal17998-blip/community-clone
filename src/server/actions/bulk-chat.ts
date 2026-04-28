"use server";

/**
 * M25: Admin bulk-add members from a channel into a group chat thread.
 * Also: createDM enforces 1:1, createGroupChat requires CHATS_MANAGE.
 */
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";

export async function createDMAction(params: { otherUserId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  if (params.otherUserId === session.user.id)
    throw new Error("CANT_DM_YOURSELF");

  // Find existing 1:1 thread
  const existing = await db.chatThread.findFirst({
    where: {
      kind: "DIRECT",
      AND: [
        { participants: { some: { userId: session.user.id } } },
        { participants: { some: { userId: params.otherUserId } } },
      ],
    },
  });
  if (existing) return existing;

  const thread = await db.chatThread.create({
    data: {
      kind: "DIRECT",
      createdById: session.user.id,
      participants: {
        create: [
          { userId: session.user.id },
          { userId: params.otherUserId },
        ],
      },
    },
  });

  revalidatePath("/chat");
  return thread;
}

export async function createGroupChatAction(params: {
  groupId: string;
  title: string;
  participantIds: string[];
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "CHATS_MANAGE",
  });

  // Always include creator as participant
  const allIds = Array.from(new Set([session.user.id, ...params.participantIds]));

  const thread = await db.chatThread.create({
    data: {
      kind: "GROUP",
      title: params.title,
      groupId: params.groupId,
      createdById: session.user.id,
      participants: {
        create: allIds.map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/chat");
  return thread;
}

export async function bulkAddFromChannelAction(params: {
  groupId: string;
  threadId: string;
  channelId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "CHATS_MANAGE",
  });

  // Determine channel members:
  // PRIVATE: ChannelAccess rows
  // PUBLIC / ANNOUNCEMENT: all ACTIVE GroupMembership for group
  const channel = await db.channel.findUnique({
    where: { id: params.channelId },
  });
  if (!channel || channel.groupId !== params.groupId)
    throw new Error("CHANNEL_MISMATCH");

  let userIds: string[];
  if (channel.kind === "PRIVATE") {
    const accesses = await db.channelAccess.findMany({
      where: { channelId: params.channelId },
      select: { userId: true },
    });
    userIds = accesses.map((a) => a.userId);
  } else {
    const memberships = await db.groupMembership.findMany({
      where: { groupId: params.groupId, state: "ACTIVE" },
      select: { userId: true },
    });
    userIds = memberships.map((m) => m.userId);
  }

  // Idempotent: skipDuplicates ensures no duplicate ChatParticipant rows
  await db.chatParticipant.createMany({
    data: userIds.map((userId) => ({ threadId: params.threadId, userId })),
    skipDuplicates: true,
  });

  revalidatePath(`/chat/${params.threadId}`);
  return { added: userIds.length };
}
