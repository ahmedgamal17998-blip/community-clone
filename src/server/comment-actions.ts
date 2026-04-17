"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Resolve the group slug + channel slug for revalidation. */
async function getPostPaths(postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      channel: {
        select: {
          slug: true,
          group: { select: { slug: true } },
        },
      },
    },
  });
  if (!post) return null;
  return {
    groupSlug: post.channel.group.slug,
    channelSlug: post.channel.slug,
  };
}

async function getGroupMembership(postId: string, userId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { channel: { select: { groupId: true } } },
  });
  if (!post) return null;
  return db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: post.channel.groupId, userId },
    },
    select: { role: true, state: true },
  });
}

// ─── Create comment ──────────────────────────────────────────────────────────

const createSchema = z
  .object({
    postId: z.string().cuid(),
    body: z.string().trim().max(2000).optional(),
    parentId: z.string().cuid().optional(),
    audioUrl: z.string().url().optional(),
    audioDurationSec: z.coerce.number().int().min(1).max(120).optional(),
  })
  .refine((d) => !!(d.body?.length || d.audioUrl), {
    message: "Either body or audio required",
  });

export async function createCommentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const bodyRaw = formData.get("body");
  const audioUrlRaw = formData.get("audioUrl");
  const audioDurationRaw = formData.get("audioDurationSec");
  const raw = {
    postId: formData.get("postId"),
    body: typeof bodyRaw === "string" && bodyRaw.length > 0 ? bodyRaw : undefined,
    parentId: formData.get("parentId") ?? undefined,
    audioUrl:
      typeof audioUrlRaw === "string" && audioUrlRaw.length > 0
        ? audioUrlRaw
        : undefined,
    audioDurationSec:
      typeof audioDurationRaw === "string" && audioDurationRaw.length > 0
        ? audioDurationRaw
        : undefined,
  };

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const membership = await getGroupMembership(parsed.data.postId, session.user.id);
  if (!membership || membership.state !== "ACTIVE") {
    return { ok: false as const, error: "Not an active member" };
  }

  // Validate parentId: it must exist, belong to this post, and be top-level (no grandchild replies).
  if (parsed.data.parentId) {
    const parent = await db.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { postId: true, parentId: true },
    });
    if (!parent) return { ok: false as const, error: "Parent comment not found" };
    if (parent.postId !== parsed.data.postId) return { ok: false as const, error: "Parent belongs to a different post" };
    if (parent.parentId !== null) return { ok: false as const, error: "Cannot reply to a reply" };
  }

  await db.comment.create({
    data: {
      postId: parsed.data.postId,
      authorId: session.user.id,
      body: parsed.data.body ?? null,
      parentId: parsed.data.parentId ?? null,
      audioUrl: parsed.data.audioUrl ?? null,
      audioDurationSec: parsed.data.audioDurationSec ?? null,
    },
  });

  const paths = await getPostPaths(parsed.data.postId);
  if (paths) {
    revalidatePath(`/groups/${paths.groupSlug}`);
    revalidatePath(`/groups/${paths.groupSlug}/channels/${paths.channelSlug}`);
  }

  return { ok: true as const };
}

// ─── Delete comment ──────────────────────────────────────────────────────────

const deleteSchema = z.object({ commentId: z.string().cuid() });

export async function deleteCommentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = deleteSchema.safeParse({ commentId: formData.get("commentId") });
  if (!parsed.success) return;

  const comment = await db.comment.findUnique({
    where: { id: parsed.data.commentId },
    select: {
      authorId: true,
      postId: true,
      post: {
        select: {
          channel: {
            select: {
              groupId: true,
              slug: true,
              group: { select: { slug: true } },
            },
          },
        },
      },
    },
  });
  if (!comment) return;

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: {
        groupId: comment.post.channel.groupId,
        userId: session.user.id,
      },
    },
    select: { role: true, state: true },
  });

  const isAdmin =
    !!membership &&
    membership.state === "ACTIVE" &&
    hasMinRole(membership.role as Role, "ADMIN");

  if (comment.authorId !== session.user.id && !isAdmin) {
    throw new Error("FORBIDDEN");
  }

  await db.comment.delete({ where: { id: parsed.data.commentId } });

  const groupSlug = comment.post.channel.group.slug;
  const channelSlug = comment.post.channel.slug;
  revalidatePath(`/groups/${groupSlug}`);
  revalidatePath(`/groups/${groupSlug}/channels/${channelSlug}`);
}

// ─── Edit comment ─────────────────────────────────────────────────────────────

const editSchema = z.object({
  commentId: z.string().cuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function editCommentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = editSchema.safeParse({
    commentId: formData.get("commentId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const comment = await db.comment.findUnique({
    where: { id: parsed.data.commentId },
    select: {
      authorId: true,
      post: {
        select: {
          channel: {
            select: {
              slug: true,
              group: { select: { slug: true } },
            },
          },
        },
      },
    },
  });
  if (!comment) return { ok: false as const, error: "Not found" };

  // Only the author can edit their own comment.
  if (comment.authorId !== session.user.id) {
    return { ok: false as const, error: "Forbidden" };
  }

  await db.comment.update({
    where: { id: parsed.data.commentId },
    data: { body: parsed.data.body, editedAt: new Date() },
  });

  const groupSlug = comment.post.channel.group.slug;
  const channelSlug = comment.post.channel.slug;
  revalidatePath(`/groups/${groupSlug}`);
  revalidatePath(`/groups/${groupSlug}/channels/${channelSlug}`);

  return { ok: true as const };
}
