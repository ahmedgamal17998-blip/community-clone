/**
 * Chat service (M8).
 *
 *  - Inbox, thread fetch, paginated messages.
 *  - Server actions: send / edit / delete / pin / mark-read.
 *  - start-or-get DIRECT thread, create GROUP thread.
 *  - Unread counts (inbox + per-channel).
 *
 * Notifications: for DIRECT/GROUP kinds we notify other participants with a
 * `CHAT_MESSAGE` type. CHANNEL kind skips per-message notifs (users already
 * see them in the group feed) but still honours @mentions.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { createNotification, notifyMentions } from "@/server/notifications";
import { getPusherServer } from "@/lib/pusher-server";
import { hasGroupSubscriptionAccess } from "@/server/access";

const DEFAULT_PAGE = 30;

// ─── Read helpers ──────────────────────────────────────────────────────────

export type InboxThreadRow = {
  id: string;
  kind: string;
  title: string | null;
  updatedAt: Date;
  otherUser: {
    id: string;
    name: string | null;
    handle: string;
    image: string | null;
  } | null;
  participantCount: number;
  lastMessage: {
    id: string;
    body: string | null;
    mediaType: string | null;
    createdAt: Date;
    authorName: string | null;
  } | null;
  unreadCount: number;
};

export async function listInboxThreads(userId: string): Promise<InboxThreadRow[]> {
  const rows = await db.chatParticipant.findMany({
    where: {
      userId,
      thread: { kind: { in: ["DIRECT", "GROUP"] } },
    },
    include: {
      thread: {
        include: {
          participants: {
            include: {
              user: {
                select: { id: true, name: true, handle: true, image: true },
              },
            },
          },
        },
      },
    },
    orderBy: { thread: { updatedAt: "desc" } },
  });

  const results: InboxThreadRow[] = [];
  for (const p of rows) {
    const lastMsg = await db.chatMessage.findFirst({
      where: { threadId: p.threadId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    });

    const unreadCount = await db.chatMessage.count({
      where: {
        threadId: p.threadId,
        deletedAt: null,
        authorId: { not: userId },
        createdAt: p.lastReadAt ? { gt: p.lastReadAt } : undefined,
      },
    });

    const others = p.thread.participants.filter((pp) => pp.userId !== userId);
    const otherUser =
      p.thread.kind === "DIRECT" && others[0]
        ? {
            id: others[0].user.id,
            name: others[0].user.name,
            handle: others[0].user.handle,
            image: others[0].user.image,
          }
        : null;

    results.push({
      id: p.thread.id,
      kind: p.thread.kind,
      title: p.thread.title,
      updatedAt: p.thread.updatedAt,
      otherUser,
      participantCount: p.thread.participants.length,
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            body: lastMsg.body,
            mediaType: lastMsg.mediaType,
            createdAt: lastMsg.createdAt,
            authorName: lastMsg.author.name,
          }
        : null,
      unreadCount,
    });
  }

  // Sort by last-message time (fallback to thread.updatedAt).
  results.sort((a, b) => {
    const aT = a.lastMessage?.createdAt.getTime() ?? a.updatedAt.getTime();
    const bT = b.lastMessage?.createdAt.getTime() ?? b.updatedAt.getTime();
    return bT - aT;
  });
  return results;
}

export async function getThread(threadId: string, userId: string) {
  const participant = await db.chatParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  if (!participant) return null;

  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, name: true, handle: true, image: true },
          },
        },
      },
      channel: {
        select: {
          id: true,
          slug: true,
          name: true,
          groupId: true,
          group: { select: { slug: true } },
        },
      },
    },
  });
  if (!thread) return null;

  const pinned = await db.chatMessage.findMany({
    where: { threadId, pinned: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, handle: true, image: true } },
    },
  });

  const messages = await db.chatMessage.findMany({
    where: { threadId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: DEFAULT_PAGE,
    include: {
      author: { select: { id: true, name: true, handle: true, image: true } },
      replyTo: {
        select: {
          id: true,
          body: true,
          authorId: true,
          author: { select: { name: true, handle: true } },
        },
      },
    },
  });

  return {
    thread,
    participant,
    pinned,
    messages: messages.reverse(),
  };
}

export type ListMessagesArgs = {
  threadId: string;
  userId: string;
  before?: string; // message id
  after?: string; // message id — fetch strictly newer than this
  limit?: number;
};

export async function listMessages(args: ListMessagesArgs) {
  const participant = await db.chatParticipant.findUnique({
    where: { threadId_userId: { threadId: args.threadId, userId: args.userId } },
  });
  if (!participant) return [];

  const limit = args.limit ?? DEFAULT_PAGE;

  if (args.after) {
    const anchor = await db.chatMessage.findUnique({
      where: { id: args.after },
      select: { createdAt: true },
    });
    if (!anchor) return [];
    const rows = await db.chatMessage.findMany({
      where: {
        threadId: args.threadId,
        deletedAt: null,
        createdAt: { gt: anchor.createdAt },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        author: { select: { id: true, name: true, handle: true, image: true } },
        replyTo: {
          select: {
            id: true,
            body: true,
            authorId: true,
            author: { select: { name: true, handle: true } },
          },
        },
      },
    });
    return rows;
  }

  if (args.before) {
    const anchor = await db.chatMessage.findUnique({
      where: { id: args.before },
      select: { createdAt: true },
    });
    if (!anchor) return [];
    const rows = await db.chatMessage.findMany({
      where: {
        threadId: args.threadId,
        deletedAt: null,
        createdAt: { lt: anchor.createdAt },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        author: { select: { id: true, name: true, handle: true, image: true } },
        replyTo: {
          select: {
            id: true,
            body: true,
            authorId: true,
            author: { select: { name: true, handle: true } },
          },
        },
      },
    });
    return rows.reverse();
  }

  const rows = await db.chatMessage.findMany({
    where: { threadId: args.threadId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { id: true, name: true, handle: true, image: true } },
      replyTo: {
        select: {
          id: true,
          body: true,
          authorId: true,
          author: { select: { name: true, handle: true } },
        },
      },
    },
  });
  return rows.reverse();
}

// ─── Unread counts ─────────────────────────────────────────────────────────

export async function getInboxUnreadCount(userId: string): Promise<number> {
  const participants = await db.chatParticipant.findMany({
    where: {
      userId,
      thread: { kind: { in: ["DIRECT", "GROUP"] } },
    },
    select: { threadId: true, lastReadAt: true },
  });
  let total = 0;
  for (const p of participants) {
    const n = await db.chatMessage.count({
      where: {
        threadId: p.threadId,
        deletedAt: null,
        authorId: { not: userId },
        createdAt: p.lastReadAt ? { gt: p.lastReadAt } : undefined,
      },
    });
    total += n;
  }
  return total;
}

export async function getChannelUnreadMap(
  userId: string,
  groupId: string,
): Promise<Record<string, number>> {
  const channels = await db.channel.findMany({
    where: { groupId, archived: false },
    select: { id: true, chatThread: { select: { id: true } } },
  });
  const out: Record<string, number> = {};
  for (const ch of channels) {
    if (!ch.chatThread) {
      out[ch.id] = 0;
      continue;
    }
    const p = await db.chatParticipant.findUnique({
      where: {
        threadId_userId: { threadId: ch.chatThread.id, userId },
      },
      select: { lastReadAt: true },
    });
    if (!p) {
      out[ch.id] = 0;
      continue;
    }
    out[ch.id] = await db.chatMessage.count({
      where: {
        threadId: ch.chatThread.id,
        deletedAt: null,
        authorId: { not: userId },
        createdAt: p.lastReadAt ? { gt: p.lastReadAt } : undefined,
      },
    });
  }
  return out;
}

// ─── Send / edit / delete / pin ───────────────────────────────────────────

const sendSchema = z
  .object({
    threadId: z.string().cuid(),
    body: z.string().trim().max(4000).optional(),
    mediaUrl: z.string().url().optional(),
    mediaType: z.enum(["image", "audio", "file"]).optional(),
    replyToId: z.string().cuid().optional(),
  })
  .refine((d) => !!(d.body?.length || d.mediaUrl), {
    message: "Empty message",
  });

export async function sendMessageAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = sendSchema.safeParse({
    threadId: formData.get("threadId"),
    body: (formData.get("body") as string) || undefined,
    mediaUrl: (formData.get("mediaUrl") as string) || undefined,
    mediaType: (formData.get("mediaType") as string) || undefined,
    replyToId: (formData.get("replyToId") as string) || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const participant = await db.chatParticipant.findUnique({
    where: {
      threadId_userId: {
        threadId: parsed.data.threadId,
        userId: session.user.id,
      },
    },
    include: {
      thread: {
        include: {
          participants: { select: { userId: true } },
          channel: { select: { id: true, slug: true, groupId: true, group: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!participant) throw new Error("FORBIDDEN");

  // Monetization gate: DMs / group chats inside a group require an active
  // subscription or trial. Channel chats are gated separately via the
  // per-channel access matrix.
  //
  // Strategy: identify the relevant group(s):
  //   1. thread.groupId (set for group chats and group-scoped DMs).
  //   2. For DIRECT threads with no groupId, look at every group shared
  //      between the two participants. If the sender lacks sub access in
  //      *every* shared group AND is not an admin in any of them, block.
  if (participant.thread.kind !== "CHANNEL") {
    const otherIds = participant.thread.participants
      .map((p) => p.userId)
      .filter((id) => id !== session.user.id);

    // Collect candidate group IDs.
    let groupIds: string[] = [];
    if (participant.thread.groupId) {
      groupIds = [participant.thread.groupId];
    } else if (
      participant.thread.kind === "DIRECT" &&
      otherIds.length === 1
    ) {
      const senderGroups = await db.groupMembership.findMany({
        where: { userId: session.user.id, state: "ACTIVE" },
        select: { groupId: true },
      });
      const otherGroups = await db.groupMembership.findMany({
        where: { userId: otherIds[0], state: "ACTIVE" },
        select: { groupId: true },
      });
      const otherSet = new Set(otherGroups.map((g) => g.groupId));
      groupIds = senderGroups
        .map((g) => g.groupId)
        .filter((g) => otherSet.has(g));
    }

    if (groupIds.length > 0) {
      // Allow if the sender is admin OR has sub/trial in *any* shared group.
      let allowed = false;
      for (const gid of groupIds) {
        const m = await db.groupMembership.findUnique({
          where: { groupId_userId: { groupId: gid, userId: session.user.id } },
          select: { role: true },
        });
        if (m && hasMinRole(m.role as Role, "ADMIN")) {
          allowed = true;
          break;
        }
        const ok = await hasGroupSubscriptionAccess({
          userId: session.user.id,
          groupId: gid,
        });
        if (ok) {
          allowed = true;
          break;
        }
      }
      if (!allowed) {
        return {
          ok: false as const,
          error:
            "Subscribe to send messages. Activate a plan or wait for your trial.",
        };
      }
    }
  }

  const msg = await db.chatMessage.create({
    data: {
      threadId: parsed.data.threadId,
      authorId: session.user.id,
      body: parsed.data.body ?? null,
      mediaUrl: parsed.data.mediaUrl ?? null,
      mediaType: parsed.data.mediaType ?? null,
      replyToId: parsed.data.replyToId ?? null,
    },
    include: {
      author: { select: { id: true, name: true, handle: true, image: true } },
      replyTo: {
        select: {
          id: true,
          body: true,
          authorId: true,
          author: { select: { name: true, handle: true } },
        },
      },
    },
  });

  // M15: trigger real-time event — silently skip if Pusher is not configured.
  const pusher = getPusherServer();
  if (pusher) {
    await pusher
      .trigger(`private-thread-${parsed.data.threadId}`, "new-message", {
        id: msg.id,
        threadId: msg.threadId,
        authorId: msg.authorId,
        body: msg.body,
        mediaUrl: msg.mediaUrl,
        mediaType: msg.mediaType,
        pinned: msg.pinned,
        editedAt: msg.editedAt?.toISOString() ?? null,
        createdAt: msg.createdAt.toISOString(),
        author: msg.author,
        replyTo: msg.replyTo
          ? {
              id: msg.replyTo.id,
              body: msg.replyTo.body,
              author: msg.replyTo.author,
            }
          : null,
      })
      .catch(() => {
        /* ignore — non-critical */
      });
  }

  await db.chatThread.update({
    where: { id: parsed.data.threadId },
    data: { updatedAt: new Date() },
  });

  // Update sender's lastReadAt so their own msg isn't unread for them.
  await db.chatParticipant.update({
    where: {
      threadId_userId: {
        threadId: parsed.data.threadId,
        userId: session.user.id,
      },
    },
    data: { lastReadAt: new Date() },
  });

  const thread = participant.thread;
  const isChannel = thread.kind === "CHANNEL";

  if (!isChannel) {
    const href = `/chat/${thread.id}`;
    const snippet = parsed.data.body ?? (parsed.data.mediaType ? `[${parsed.data.mediaType}]` : null);
    for (const pp of thread.participants) {
      if (pp.userId === session.user.id) continue;
      await createNotification({
        userId: pp.userId,
        actorId: session.user.id,
        type: "CHAT_MESSAGE" as any,
        snippet,
        href,
      });
    }
  }

  // Mentions (need group context).
  if (parsed.data.body && thread.channel?.groupId) {
    const href = isChannel
      ? `/groups/${thread.channel.group.slug}/channels/${thread.channel.slug}?view=chat`
      : `/chat/${thread.id}`;
    await notifyMentions({
      text: parsed.data.body,
      actorId: session.user.id,
      groupId: thread.channel.groupId,
      href,
      snippet: parsed.data.body,
    });
  }

  // Revalidate UI.
  if (isChannel && thread.channel) {
    revalidatePath(
      `/groups/${thread.channel.group.slug}/channels/${thread.channel.slug}`,
    );
  } else {
    revalidatePath(`/chat/${thread.id}`);
    revalidatePath(`/chat`);
  }

  return { ok: true as const, messageId: msg.id };
}

const editSchema = z.object({
  messageId: z.string().cuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function editMessageAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const parsed = editSchema.safeParse({
    messageId: formData.get("messageId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { ok: false as const };

  const msg = await db.chatMessage.findUnique({
    where: { id: parsed.data.messageId },
    select: { authorId: true, threadId: true },
  });
  if (!msg || msg.authorId !== session.user.id) throw new Error("FORBIDDEN");

  await db.chatMessage.update({
    where: { id: parsed.data.messageId },
    data: { body: parsed.data.body, editedAt: new Date() },
  });
  revalidatePath(`/chat/${msg.threadId}`);
  return { ok: true as const };
}

const deleteSchema = z.object({ messageId: z.string().cuid() });

export async function deleteMessageAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const parsed = deleteSchema.safeParse({
    messageId: formData.get("messageId"),
  });
  if (!parsed.success) return { ok: false as const };

  const msg = await db.chatMessage.findUnique({
    where: { id: parsed.data.messageId },
    include: {
      thread: {
        select: {
          id: true,
          kind: true,
          channel: { select: { groupId: true, slug: true, group: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!msg) return { ok: false as const };

  let authorized = msg.authorId === session.user.id;
  if (!authorized && msg.thread.kind === "CHANNEL" && msg.thread.channel) {
    const membership = await db.groupMembership.findUnique({
      where: {
        groupId_userId: {
          groupId: msg.thread.channel.groupId,
          userId: session.user.id,
        },
      },
      select: { role: true, state: true },
    });
    if (
      membership?.state === "ACTIVE" &&
      hasMinRole(membership.role as Role, "ADMIN")
    ) {
      authorized = true;
    }
  }
  if (!authorized) throw new Error("FORBIDDEN");

  await db.chatMessage.update({
    where: { id: parsed.data.messageId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/chat/${msg.threadId}`);
  if (msg.thread.channel) {
    revalidatePath(
      `/groups/${msg.thread.channel.group.slug}/channels/${msg.thread.channel.slug}`,
    );
  }
  return { ok: true as const };
}

const pinSchema = z.object({ messageId: z.string().cuid() });

export async function togglePinAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const parsed = pinSchema.safeParse({
    messageId: formData.get("messageId"),
  });
  if (!parsed.success) return { ok: false as const };

  const msg = await db.chatMessage.findUnique({
    where: { id: parsed.data.messageId },
    include: {
      thread: {
        select: {
          id: true,
          kind: true,
          channel: { select: { groupId: true, slug: true, group: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!msg) return { ok: false as const };
  if (msg.thread.kind !== "CHANNEL" || !msg.thread.channel) {
    throw new Error("ONLY_CHANNEL_PIN");
  }

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: {
        groupId: msg.thread.channel.groupId,
        userId: session.user.id,
      },
    },
    select: { role: true, state: true },
  });
  if (
    !membership ||
    membership.state !== "ACTIVE" ||
    !hasMinRole(membership.role as Role, "ADMIN")
  ) {
    throw new Error("FORBIDDEN");
  }

  await db.chatMessage.update({
    where: { id: parsed.data.messageId },
    data: { pinned: !msg.pinned },
  });
  revalidatePath(
    `/groups/${msg.thread.channel.group.slug}/channels/${msg.thread.channel.slug}`,
  );
  return { ok: true as const };
}

const markReadSchema = z.object({ threadId: z.string().cuid() });

export async function markThreadReadAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false as const };
  const parsed = markReadSchema.safeParse({
    threadId: formData.get("threadId"),
  });
  if (!parsed.success) return { ok: false as const };

  await db.chatParticipant.updateMany({
    where: { threadId: parsed.data.threadId, userId: session.user.id },
    data: { lastReadAt: new Date() },
  });
  return { ok: true as const };
}

// ─── Thread creation ───────────────────────────────────────────────────────

export async function startOrGetDirectThread(params: {
  userAId: string;
  userBId: string;
}): Promise<string> {
  if (params.userAId === params.userBId) throw new Error("CANNOT_DM_SELF");

  // Look for existing DIRECT thread with exactly those two participants.
  const candidates = await db.chatThread.findMany({
    where: {
      kind: "DIRECT",
      participants: { some: { userId: params.userAId } },
    },
    include: { participants: { select: { userId: true } } },
  });
  for (const t of candidates) {
    if (
      t.participants.length === 2 &&
      t.participants.some((p) => p.userId === params.userBId)
    ) {
      return t.id;
    }
  }

  const created = await db.chatThread.create({
    data: {
      kind: "DIRECT",
      participants: {
        create: [{ userId: params.userAId }, { userId: params.userBId }],
      },
    },
  });
  return created.id;
}

export async function startDirectThreadAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const otherId = (formData.get("userId") as string) || "";
  if (!otherId) throw new Error("INVALID");
  const threadId = await startOrGetDirectThread({
    userAId: session.user.id,
    userBId: otherId,
  });
  return { ok: true as const, threadId };
}

const groupThreadSchema = z.object({
  title: z.string().trim().min(1).max(80),
  participantIds: z.array(z.string().cuid()).min(2).max(50),
  groupId: z.string().cuid(),
});

export async function createGroupThreadAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const rawIds = formData.getAll("participantIds").map(String).filter(Boolean);
  const parsed = groupThreadSchema.safeParse({
    title: formData.get("title"),
    participantIds: rawIds,
    groupId: formData.get("groupId"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ids = Array.from(
    new Set(parsed.data.participantIds.filter((id) => id !== session.user.id)),
  );
  if (ids.length < 2) {
    return { ok: false as const, error: "Need at least 2 other members" };
  }

  // Server-side capability gate: members can DM but only admins with
  // CHATS_MANAGE can create group chats. Owner bypasses.
  const { hasCapability } = await import("@/server/capabilities");
  const allowed = await hasCapability({
    userId: session.user.id,
    groupId: parsed.data.groupId,
    capability: "CHATS_MANAGE",
  });
  if (!allowed) {
    return {
      ok: false as const,
      error: "Only admins can create group chats in this community",
    };
  }

  // Verify creator + all participants are ACTIVE members of the chosen group.
  const allUserIds = [session.user.id, ...ids];
  const memberships = await db.groupMembership.findMany({
    where: {
      groupId: parsed.data.groupId,
      userId: { in: allUserIds },
      state: "ACTIVE",
    },
    select: { userId: true },
  });
  if (memberships.length !== allUserIds.length) {
    return {
      ok: false as const,
      error: "All members must be active in the selected group",
    };
  }

  const created = await db.chatThread.create({
    data: {
      kind: "GROUP",
      title: parsed.data.title,
      groupId: parsed.data.groupId,
      participants: {
        create: [
          { userId: session.user.id },
          ...ids.map((userId) => ({ userId })),
        ],
      },
    },
  });
  revalidatePath("/chat");
  revalidatePath(`/groups/[slug]/me`, "page");
  return { ok: true as const, threadId: created.id };
}
