/**
 * Post service (M4a + M5).
 *
 * Read-side: feed queries for group + channel + single post. Cursor-paginated
 * with a stable order (pinned desc, createdAt desc, id desc tiebreak).
 *
 * Write-side lives in `post-actions.ts` to keep the "use server" boundary clean.
 *
 * `mediaUrls` is stored as JSON string; we decode on read and re-encode on write.
 */
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";
import { listVisibleChannels } from "@/server/channels";
import { hasAccessBulk } from "@/server/access";
import { hasMinRole, type Role } from "@/server/permissions";
import { SUPPORTED_EMOJIS, type ReactionSummary } from "@/server/comments";

export const PAGE_SIZE = 20;

export type PostMedia = string[];

export function decodeMedia(json: string): PostMedia {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function encodeMedia(urls: PostMedia): string {
  return JSON.stringify(urls.filter(Boolean));
}

// ─── Poll data shapes ────────────────────────────────────────────────────────

export type PollOptionData = {
  id: string;
  text: string;
  order: number;
  voteCount: number;
  viewerVoted: boolean;
};

export type PollData = {
  id: string;
  question: string;
  multipleChoice: boolean;
  closedAt: Date | null;
  options: PollOptionData[];
  totalVotes: number;
  viewerVoteOptionIds: string[];
};

// ─── Base include (no viewer-specific data) ──────────────────────────────────

/** Shared include shape so every route renders the same PostCard data. */
const postInclude = {
  author: {
    select: {
      id: true,
      name: true,
      handle: true,
      image: true,
    },
  },
  channel: {
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      group: { select: { slug: true } },
    },
  },
} satisfies Prisma.PostInclude;

/** Include with engagement counts + reactions for feed serialization. */
function engagementInclude(viewerId: string) {
  return {
    ...postInclude,
    _count: { select: { comments: true } },
    reactions: { select: { emoji: true, authorId: true } },
    poll: {
      include: {
        options: {
          orderBy: { order: "asc" as const },
          include: {
            _count: { select: { votes: true } },
            votes: { where: { userId: viewerId }, select: { id: true } },
          },
        },
      },
    },
  } satisfies Prisma.PostInclude;
}

type PostWithEngagement = Prisma.PostGetPayload<{
  include: ReturnType<typeof engagementInclude>;
}>;

type PostWithIncludes = Prisma.PostGetPayload<{ include: typeof postInclude }>;

// ─── Reaction summary helper ─────────────────────────────────────────────────

export function buildPostReactions(
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
  return SUPPORTED_EMOJIS
    .filter((e) => countMap.has(e))
    .map((e) => ({
      emoji: e,
      count: countMap.get(e)!.count,
      viewerReacted: countMap.get(e)!.viewerReacted,
    }));
}

// ─── Poll data helper ────────────────────────────────────────────────────────

export function buildPollData(
  poll: PostWithEngagement["poll"],
): PollData | undefined {
  if (!poll) return undefined;

  const totalVotes = poll.options.reduce((acc, o) => acc + o._count.votes, 0);
  const viewerVoteOptionIds = poll.options
    .filter((o) => o.votes.length > 0)
    .map((o) => o.id);

  return {
    id: poll.id,
    question: poll.question,
    multipleChoice: poll.multipleChoice,
    closedAt: poll.closedAt,
    totalVotes,
    viewerVoteOptionIds,
    options: poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      order: o.order,
      voteCount: o._count.votes,
      viewerVoted: o.votes.length > 0,
    })),
  };
}

// ─── Serialized post shape for API / FeedClient ──────────────────────────────

export type SerializedPost = {
  id: string;
  title: string | null;
  body: string;
  mediaUrls: string[];
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
  authorId: string;
  author: { id: string; name: string | null; handle: string; image: string | null };
  channel: { id: string; slug: string; name: string; kind: string; group: { slug: string } };
  commentCount: number;
  reactions: ReactionSummary[];
  poll: PollData | null;
};

export function serializePost(
  p: PostWithEngagement,
  viewerId: string,
): SerializedPost {
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    mediaUrls: decodeMedia(p.mediaUrls),
    pinned: p.pinned,
    createdAt: p.createdAt.toISOString(),
    editedAt: p.editedAt?.toISOString() ?? null,
    authorId: p.authorId,
    author: p.author,
    channel: p.channel,
    commentCount: p._count.comments,
    reactions: buildPostReactions(p.reactions, viewerId),
    poll: buildPollData(p.poll) ?? null,
  };
}

// ─── Cursor helpers ──────────────────────────────────────────────────────────

export type Cursor = { createdAt: string; id: string } | null;

function parseCursor(raw: string | null | undefined): Cursor {
  if (!raw) return null;
  const [iso, id] = raw.split("|");
  if (!iso || !id) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { createdAt: iso, id };
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

// ─── Feed queries ────────────────────────────────────────────────────────────

/**
 * Feed for one channel — pinned posts first, then newest-first.
 * Returns `{ items, nextCursor }` so callers can paginate.
 * Now includes engagement data (reactions, comment count, poll).
 */
export async function listChannelPosts(params: {
  channelId: string;
  viewerId: string;
  cursor?: string | null;
  pageSize?: number;
}) {
  const pageSize = params.pageSize ?? PAGE_SIZE;
  const cursor = parseCursor(params.cursor);
  const include = engagementInclude(params.viewerId);

  let pinned: PostWithEngagement[] = [];
  if (!cursor) {
    pinned = await db.post.findMany({
      where: { channelId: params.channelId, pinned: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include,
    });
  }

  const items = await db.post.findMany({
    where: {
      channelId: params.channelId,
      pinned: false,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include,
  });

  const hasMore = items.length > pageSize;
  const page = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;

  return { pinned, items: page, nextCursor };
}

/**
 * Group feed — posts from every channel the viewer can see.
 * Includes engagement data.
 */
export async function listGroupFeed(params: {
  groupId: string;
  userId: string;
  cursor?: string | null;
  pageSize?: number;
}) {
  const pageSize = params.pageSize ?? PAGE_SIZE;
  const cursor = parseCursor(params.cursor);
  const include = engagementInclude(params.userId);

  const visibleChannels = await listVisibleChannels(params.groupId, params.userId);
  let channelIds = visibleChannels.map((c) => c.id);
  if (channelIds.length === 0) {
    return { pinned: [], items: [], nextCursor: null };
  }

  // Hide posts from channels the viewer can't access (e.g. PREMIUM channels
  // when no subscription / trial). Admins / owners bypass — they always see
  // every post for moderation. We resolve membership role inline because
  // listVisibleChannels itself doesn't surface it.
  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: params.groupId, userId: params.userId } },
    select: { role: true, state: true },
  });
  const isAdmin =
    !!me && me.state === "ACTIVE" && hasMinRole(me.role as Role, "ADMIN");
  if (!isAdmin) {
    const access = await hasAccessBulk({
      userId: params.userId,
      groupId: params.groupId,
      resourceType: "CHANNEL",
      resourceIds: channelIds,
    });
    channelIds = channelIds.filter((id) => access.get(id) !== false);
    if (channelIds.length === 0) {
      return { pinned: [], items: [], nextCursor: null };
    }
  }

  let pinned: PostWithEngagement[] = [];
  if (!cursor) {
    pinned = await db.post.findMany({
      where: { channelId: { in: channelIds }, pinned: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include,
    });
  }

  const items = await db.post.findMany({
    where: {
      channelId: { in: channelIds },
      pinned: false,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include,
  });

  const hasMore = items.length > pageSize;
  const page = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;

  return { pinned, items: page, nextCursor };
}

export async function getPostById(id: string) {
  return db.post.findUnique({ where: { id }, include: postInclude });
}

export async function getPostWithEngagement(postId: string, viewerId: string) {
  return db.post.findUnique({
    where: { id: postId },
    include: engagementInclude(viewerId),
  });
}

/** Shape returned by the feed queries, for typed prop-drilling. */
export type FeedPost = PostWithEngagement | null;
