"use server";

import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { createNotification } from "@/server/notifications";
import { addPoints } from "@/server/points";

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
      // Notify post author on reaction create (post-level only).
      try {
        const post = await db.post.findUnique({
          where: { id: postId },
          select: {
            authorId: true,
            body: true,
            channel: {
              select: {
                slug: true,
                groupId: true,
                group: { select: { slug: true } },
              },
            },
          },
        });
        if (post && post.authorId !== authorId) {
          await createNotification({
            userId: post.authorId,
            actorId: authorId,
            type: "REACTION_ON_POST",
            groupId: post.channel.groupId,
            postId,
            snippet: `${emoji} on your post`,
            href: `/groups/${post.channel.group.slug}/channels/${post.channel.slug}#post-${postId}`,
          });
        }
        // Points: award target post author +1 REACTION_RECEIVED (skip self).
        if (post && post.authorId !== authorId) {
          try {
            await addPoints({
              userId: post.authorId,
              groupId: post.channel.groupId,
              delta: 1,
              reason: "REACTION_RECEIVED",
              refType: "reaction",
              refId: `post:${postId}:${authorId}:${emoji}`,
            });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("addPoints (reaction on post) failed", e);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("reaction notification failed", e);
      }
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
      // Points: award target comment author.
      try {
        const c = await db.comment.findUnique({
          where: { id: commentId },
          select: {
            authorId: true,
            post: { select: { channel: { select: { groupId: true } } } },
          },
        });
        if (c && c.authorId !== authorId) {
          await addPoints({
            userId: c.authorId,
            groupId: c.post.channel.groupId,
            delta: 1,
            reason: "REACTION_RECEIVED",
            refType: "reaction",
            refId: `comment:${commentId}:${authorId}:${emoji}`,
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("addPoints (reaction on comment) failed", e);
      }
    }
  }
}
