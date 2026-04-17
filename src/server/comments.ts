/**
 * Comment query helpers (M5).
 *
 * Returns up to 2 levels of comments: top-level + their direct replies.
 * Each comment includes the author, per-emoji reaction counts, and whether
 * the given viewer has reacted with each emoji.
 */
import { db } from "@/server/db";

export const SUPPORTED_EMOJIS = ["❤️", "👍", "🎉", "🤔", "👏"] as const;
export type SupportedEmoji = (typeof SUPPORTED_EMOJIS)[number];

export type ReactionSummary = {
  emoji: string;
  count: number;
  viewerReacted: boolean;
};

export type CommentAuthor = {
  id: string;
  name: string | null;
  handle: string;
  image: string | null;
};

export type CommentItem = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string | null;
  audioUrl: string | null;
  audioDurationSec: number | null;
  createdAt: Date;
  editedAt: Date | null;
  authorId: string;
  author: CommentAuthor;
  reactions: ReactionSummary[];
};

export type CommentWithReplies = CommentItem & {
  replies: CommentItem[];
};

function buildReactionSummaries(
  rawReactions: { emoji: string; authorId: string }[],
  viewerId: string,
): ReactionSummary[] {
  const countMap = new Map<string, { count: number; viewerReacted: boolean }>();

  for (const r of rawReactions) {
    const entry = countMap.get(r.emoji) ?? { count: 0, viewerReacted: false };
    entry.count += 1;
    if (r.authorId === viewerId) entry.viewerReacted = true;
    countMap.set(r.emoji, entry);
  }

  // Return only emojis that have at least one reaction, in canonical order.
  return SUPPORTED_EMOJIS
    .filter((e) => countMap.has(e))
    .map((e) => ({
      emoji: e,
      count: countMap.get(e)!.count,
      viewerReacted: countMap.get(e)!.viewerReacted,
    }));
}

export async function getPostComments(
  postId: string,
  viewerId: string,
): Promise<CommentWithReplies[]> {
  const rows = await db.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, handle: true, image: true } },
      reactions: { select: { emoji: true, authorId: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, handle: true, image: true } },
          reactions: { select: { emoji: true, authorId: true } },
        },
      },
    },
  });

  // Only keep top-level comments (parentId === null).
  const topLevel = rows.filter((r) => r.parentId === null);

  return topLevel.map((c) => ({
    id: c.id,
    postId: c.postId,
    parentId: c.parentId,
    body: c.body,
    audioUrl: c.audioUrl,
    audioDurationSec: c.audioDurationSec,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    authorId: c.authorId,
    author: c.author,
    reactions: buildReactionSummaries(c.reactions, viewerId),
    replies: c.replies.map((r) => ({
      id: r.id,
      postId: r.postId,
      parentId: r.parentId,
      body: r.body,
      audioUrl: r.audioUrl,
      audioDurationSec: r.audioDurationSec,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
      authorId: r.authorId,
      author: r.author,
      reactions: buildReactionSummaries(r.reactions, viewerId),
    })),
  }));
}
