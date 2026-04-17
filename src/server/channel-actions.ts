"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { requireRole } from "@/server/permissions";
import {
  CHANNEL_KINDS,
  uniqueChannelSlug,
  ensureChannelThread,
  syncChannelParticipants,
} from "@/server/channels";

// ─── Create channel (admin+) ───────────────────────────────────────────────

const createSchema = z.object({
  groupId: z.string().cuid(),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).optional(),
  kind: z.enum(CHANNEL_KINDS),
  emoji: z.string().trim().max(4).optional(),
});

export async function createChannelAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = createSchema.safeParse({
    groupId: formData.get("groupId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    kind: formData.get("kind"),
    emoji: formData.get("emoji") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  const group = await db.group.findUnique({
    where: { id: parsed.data.groupId },
    select: { slug: true },
  });
  if (!group) return { ok: false as const, error: "Group not found" };

  // Position: append to the end of the current channel list.
  const last = await db.channel.findFirst({
    where: { groupId: parsed.data.groupId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const { channel, threadId } = await db.$transaction(async (tx) => {
    const slug = await uniqueChannelSlug(tx, parsed.data.groupId, parsed.data.name);
    const channel = await tx.channel.create({
      data: {
        groupId: parsed.data.groupId,
        slug,
        name: parsed.data.name,
        description: parsed.data.description,
        kind: parsed.data.kind,
        emoji: parsed.data.emoji,
        position,
      },
    });
    const threadId = await ensureChannelThread(tx, channel.id);
    return { channel, threadId };
  });

  // threadId is set but unused here — held for downstream telemetry / audit.
  void threadId;

  revalidatePath(`/groups/${group.slug}`);
  redirect(`/groups/${group.slug}/channels/${channel.slug}`);
}

// ─── Rename / edit channel (admin+) ────────────────────────────────────────

const editSchema = z.object({
  channelId: z.string().cuid(),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).optional(),
  emoji: z.string().trim().max(4).optional(),
});

export async function editChannelAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = editSchema.safeParse({
    channelId: formData.get("channelId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    emoji: formData.get("emoji") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const channel = await db.channel.findUnique({
    where: { id: parsed.data.channelId },
    include: { group: { select: { slug: true } } },
  });
  if (!channel) return { ok: false as const, error: "Channel not found" };

  await requireRole({
    groupId: channel.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.channel.update({
    where: { id: channel.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      emoji: parsed.data.emoji,
    },
  });

  revalidatePath(`/groups/${channel.group.slug}`);
  revalidatePath(`/groups/${channel.group.slug}/channels/${channel.slug}`);
  return { ok: true as const };
}

// ─── Delete channel (admin+) ───────────────────────────────────────────────

const deleteSchema = z.object({ channelId: z.string().cuid() });

export async function deleteChannelAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = deleteSchema.safeParse({ channelId: formData.get("channelId") });
  if (!parsed.success) return;

  const channel = await db.channel.findUnique({
    where: { id: parsed.data.channelId },
    include: { group: { select: { slug: true } } },
  });
  if (!channel) return;

  await requireRole({
    groupId: channel.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.channel.delete({ where: { id: channel.id } });

  revalidatePath(`/groups/${channel.group.slug}`);
  redirect(`/groups/${channel.group.slug}`);
}

// ─── Grant / revoke PRIVATE channel access (admin+) ────────────────────────

const grantSchema = z.object({
  channelId: z.string().cuid(),
  userId: z.string().cuid(),
  action: z.enum(["GRANT", "REVOKE"]),
});

export async function setChannelAccessAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = grantSchema.safeParse({
    channelId: formData.get("channelId"),
    userId: formData.get("userId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return;

  const channel = await db.channel.findUnique({
    where: { id: parsed.data.channelId },
    include: { group: { select: { slug: true } } },
  });
  if (!channel) return;
  if (channel.kind !== "PRIVATE") return; // grants only apply to private channels

  await requireRole({
    groupId: channel.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.$transaction(async (tx) => {
    if (parsed.data.action === "GRANT") {
      await tx.channelAccess.upsert({
        where: {
          channelId_userId: {
            channelId: parsed.data.channelId,
            userId: parsed.data.userId,
          },
        },
        update: {},
        create: {
          channelId: parsed.data.channelId,
          userId: parsed.data.userId,
        },
      });
    } else {
      await tx.channelAccess.deleteMany({
        where: {
          channelId: parsed.data.channelId,
          userId: parsed.data.userId,
        },
      });
    }
    await syncChannelParticipants(tx, parsed.data.channelId);
  });

  revalidatePath(`/groups/${channel.group.slug}/channels/${channel.slug}`);
}
