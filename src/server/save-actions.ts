/**
 * SavedPost CRUD — bookmark a post for later. Idempotent toggle.
 */
"use server";

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { addPoints } from "@/server/points";

/**
 * Toggle: if already saved → un-save. Otherwise create a SavedPost row.
 * Returns the new saved state so the UI can swap its icon.
 */
export async function toggleSavePostAction(input: { postId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  // Verify the post exists + caller can see it (must be ACTIVE in the group).
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { authorId: true, channel: { select: { groupId: true } } },
  });
  if (!post) return { ok: false as const, error: "Post not found" };

  const member = await db.groupMembership.findUnique({
    where: {
      groupId_userId: {
        groupId: post.channel.groupId,
        userId: session.user.id,
      },
    },
    select: { state: true },
  });
  if (!member || member.state !== "ACTIVE") {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  const existing = await db.savedPost.findUnique({
    where: {
      userId_postId: {
        userId: session.user.id,
        postId: input.postId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await db.savedPost.delete({ where: { id: existing.id } });
    revalidatePath("/saved");
    return { ok: true as const, saved: false };
  }

  await db.savedPost.create({
    data: { userId: session.user.id, postId: input.postId },
  });

  // Award post author +5 for receiving a save (skip self-save).
  if (post.authorId && post.authorId !== session.user.id) {
    try {
      await addPoints({
        userId: post.authorId,
        groupId: post.channel.groupId,
        delta: 5,
        reason: "POST_SAVED",
        refType: "savedPost",
        refId: `${input.postId}:${session.user.id}`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("addPoints (post saved) failed", e);
    }
  }

  revalidatePath("/saved");
  return { ok: true as const, saved: true };
}
