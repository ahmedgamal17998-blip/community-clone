"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

const voteSchema = z.object({
  pollId: z.string().cuid(),
  optionIds: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().cuid()).min(1)),
});

export async function voteOnPollAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const raw = {
    pollId: formData.get("pollId"),
    // Client sends a comma-separated list of option IDs.
    optionIds: formData.get("optionIds") ?? "",
  };

  const parsed = voteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };

  const { pollId, optionIds } = parsed.data;

  // Load poll with its options and the post for path revalidation.
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    select: {
      multipleChoice: true,
      closedAt: true,
      options: { select: { id: true } },
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
  if (!poll) return { ok: false as const, error: "Poll not found" };

  // Reject votes on closed polls.
  if (poll.closedAt && poll.closedAt < new Date()) {
    return { ok: false as const, error: "Poll is closed" };
  }

  // Verify caller is an ACTIVE member of the group.
  const groupId = poll.post.channel.groupId;
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: session.user.id } },
    select: { state: true },
  });
  if (!membership || membership.state !== "ACTIVE") {
    return { ok: false as const, error: "Not an active member" };
  }

  // Validate that all submitted optionIds belong to this poll.
  const validIds = new Set(poll.options.map((o) => o.id));
  for (const id of optionIds) {
    if (!validIds.has(id)) return { ok: false as const, error: "Invalid option" };
  }

  // For single-choice polls, only one option is allowed.
  if (!poll.multipleChoice && optionIds.length > 1) {
    return { ok: false as const, error: "Only one option allowed" };
  }

  const userId = session.user.id;

  // Get all option IDs for this poll so we can check/clear existing votes.
  const allOptionIds = poll.options.map((o) => o.id);

  // If the voter already voted the exact same single option → un-vote (toggle).
  const existingVotes = await db.pollVote.findMany({
    where: { userId, optionId: { in: allOptionIds } },
    select: { id: true, optionId: true },
  });

  const existingOptionIds = new Set(existingVotes.map((v) => v.optionId));
  const submittedSet = new Set(optionIds);

  // Toggle: if the submitted set equals the existing set, remove all votes.
  const setsEqual =
    existingOptionIds.size === submittedSet.size &&
    [...submittedSet].every((id) => existingOptionIds.has(id));

  if (setsEqual) {
    // Un-vote.
    await db.pollVote.deleteMany({
      where: { id: { in: existingVotes.map((v) => v.id) } },
    });
  } else {
    // For single-choice: clear all existing votes first, then insert.
    if (!poll.multipleChoice) {
      if (existingVotes.length > 0) {
        await db.pollVote.deleteMany({
          where: { id: { in: existingVotes.map((v) => v.id) } },
        });
      }
      await db.pollVote.create({
        data: { optionId: optionIds[0]!, userId },
      });
    } else {
      // Multiple-choice: upsert each submitted option, remove un-submitted ones.
      const toRemove = existingVotes.filter((v) => !submittedSet.has(v.optionId));
      if (toRemove.length > 0) {
        await db.pollVote.deleteMany({
          where: { id: { in: toRemove.map((v) => v.id) } },
        });
      }
      for (const optionId of optionIds) {
        if (!existingOptionIds.has(optionId)) {
          await db.pollVote.create({ data: { optionId, userId } });
        }
      }
    }
  }

  const groupSlug = poll.post.channel.group.slug;
  const channelSlug = poll.post.channel.slug;
  revalidatePath(`/groups/${groupSlug}`);
  revalidatePath(`/groups/${groupSlug}/channels/${channelSlug}`);

  return { ok: true as const };
}
