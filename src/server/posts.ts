/**
 * Post service (M4a).
 *
 * Read-side: feed queries for group + channel + single post. Cursor-paginated
 * with a stable order (pinned desc, createdAt desc, id desc tiebreak).
 *
 * Write-side lives in `post-actions.ts` to keep the "use server" boundary clean.
 *
 * `mediaUrls` is stored as JSON string on SQLite; we decode on read and
 * re-encode on write. When we move to Postgres (M4b) this becomes a native
 * `String[]` column and the helpers collapse to no-ops.
 */
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";
import { listVisibleChannels } from "@/server/channels";

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

type PostWithIncludes = Prisma.PostGetPayload<{ include: typeof postInclude }>;

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

/**
 * Feed for one channel — pinned posts first, then newest-first.
 * Returns `{ items, nextCursor }` so callers can paginate.
 */
export async function listChannelPosts(params: {
  channelId: string;
  cursor?: string | null;
  pageSize?: number;
}) {
  const pageSize = params.pageSize ?? PAGE_SIZE;
  const cursor = parseCursor(params.cursor);

  // Pinned posts only appear on the *first* page, then we switch to
  // non-pinned chronological. Simpler than a single mixed query, and UX-wise
  // pinned content shouldn't reappear deeper in the scroll.
  let pinned: PostWithIncludes[] = [];
  if (!cursor) {
    pinned = await db.post.findMany({
      where: { channelId: params.channelId, pinned: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: postInclude,
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
              {
                createdAt: new Date(cursor.createdAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: postInclude,
  });

  const hasMore = items.length > pageSize;
  const page = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;

  return {
    pinned,
    items: page,
    nextCursor,
  };
}

/**
 * Group feed — posts from every channel the viewer can see. Powers the
 * Discussion tab. Pinned posts bubble to the top once.
 */
export async function listGroupFeed(params: {
  groupId: string;
  userId: string;
  cursor?: string | null;
  pageSize?: number;
}) {
  const pageSize = params.pageSize ?? PAGE_SIZE;
  const cursor = parseCursor(params.cursor);

  const visibleChannels = await listVisibleChannels(params.groupId, params.userId);
  const channelIds = visibleChannels.map((c) => c.id);
  if (channelIds.length === 0) {
    return { pinned: [], items: [], nextCursor: null };
  }

  let pinned: PostWithIncludes[] = [];
  if (!cursor) {
    pinned = await db.post.findMany({
      where: { channelId: { in: channelIds }, pinned: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: postInclude,
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
              {
                createdAt: new Date(cursor.createdAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: postInclude,
  });

  const hasMore = items.length > pageSize;
  const page = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;

  return { pinned, items: page, nextCursor };
}

export async function getPostById(id: string) {
  return db.post.findUnique({ where: { id }, include: postInclude });
}

/** Shape returned by the feed queries, for typed prop-drilling. */
export type FeedPost = Awaited<ReturnType<typeof getPostById>>;
