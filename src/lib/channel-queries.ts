/**
 * Per-request memoized channel queries.
 *
 * React's `cache()` deduplicates calls with the same arguments within a
 * single server render. Both the channel layout and channel page call these
 * helpers — without caching each would independently hit the DB.
 *
 * Important: these helpers are SERVER-ONLY (they import Prisma directly).
 */
import { cache } from "react";
import { db } from "@/server/db";

/**
 * Fetch a channel with its group, the current user's access grants, and
 * the current user's group membership — all in ONE query.
 *
 * Used by both channel/layout.tsx and channel/page.tsx so the DB is only
 * hit once per request (React cache deduplicates identical calls).
 */
export const getChannelWithContext = cache(
  async (channelSlug: string, groupSlug: string, userId: string) => {
    return db.channel.findFirst({
      where: { slug: channelSlug, group: { slug: groupSlug } },
      include: {
        group: {
          select: {
            id: true,
            slug: true,
            memberships: {
              where: { userId },
              select: { role: true, state: true },
              take: 1,
            },
          },
        },
        accesses: { where: { userId }, select: { id: true } },
      },
    });
  },
);
