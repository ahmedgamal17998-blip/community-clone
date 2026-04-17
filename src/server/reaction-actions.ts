"use server";

import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

const SUPPORTED_EMOJIS = ["❤️", "👍", "🎉", "😂", "🤔", "👏"] as const;

const toggleSchema = z
  .object({
    emoji: z.enum(SUPPORTED_EMOJIS),
    postId: z.string().cuid().optional(),
    commentId: z.string().cuid().optional(),
  })
  .refine((d) => !!(d.postId ?? d.commentId), {
    message: "Either postId or commentId must be provided",
  })
  .refine((d) => !(d.postId && d.commentId), {
    message: "Provide postId OR commentId, not both",
  });

// ─── Toggle reaction ─────────────────────────────────────────────────────────

export async function toggleReactionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const raw = {
    emoji: formData.get("emoji"),
    postId: formData.get("postId") ?? undefined,
    commentId: formData.get("commentId") ?? undefined,
  };

  const parsed = toggleSchema.safeParse(raw);
  if (!parsed.success) return;

  const { emoji, postId, commentId } = parsed.data;
  const authorId = session.user.id;

  // Verify the caller is an ACTIVE member of the relevant group.
  let groupId: string | null = null;

  if (postId) {
    const post = await db.post.findUnique({
      where: { id: postId },
      select: { channel: { select: { groupId: true } } },
    });
    groupId = post?.channel.groupId ?? null;
  } else if (commentId) {
    const comment = await db.comment.findUnique({
      where: { id: commentId },
      select: { post: { select: { channel: { select: { groupId: true } } } } },
    });
    groupId = comment?.post.channel.groupId ?? null;
  }

  if (!groupId) return;

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: authorId } },
    select: { state: true },
  });
  if (!membership || membership.state !== "ACTIVE") return;

  // Toggle: try to create; if unique-constraint fires, delete instead.
  if (postId) {
    const existing = await db.reaction.findUnique({
      where: { authorId_emoji_postId: { authorId, emoji, postId } },
      select: { id: true },
    });
    if (existing) {
      await db.reaction.delete({ where: { id: existing.id } });
    } else {
      await db.reaction.create({
        data: { emoji, authorId, postId },
      });
    }
  } else if (commentId) {
    const existing = await db.reaction.findUnique({
      where: { authorId_emoji_commentId: { authorId, emoji, commentId } },
      select: { id: true },
    });
    if (existing) {
      await db.reaction.delete({ where: { id: existing.id } });
    } else {
      await db.reaction.create({
        data: { emoji, authorId, commentId },
      });
    }
  }
}
