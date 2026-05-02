/**
 * Channel service (M3).
 *
 * Responsibilities:
 *  - Create / rename / archive channels.
 *  - Auto-provision a CHANNEL ChatThread on every new channel, and backfill
 *    ChatParticipant rows for the eligible member set.
 *  - Keep ChatParticipant rows in sync as:
 *      • a group member joins / leaves a group  (PUBLIC + ANNOUNCEMENT channels)
 *      • a user is granted / revoked ChannelAccess  (PRIVATE channels)
 *
 * The channel → thread relation is 1:1 via `Channel.id` / `ChatThread.channelId`.
 * Thread-level message code lives in M8; this file owns nothing more than the
 * structural bookkeeping.
 */
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";

export const CHANNEL_KINDS = ["PUBLIC", "PRIVATE", "ANNOUNCEMENT"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

// ─── Slug helpers ──────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function uniqueChannelSlug(
  client: Prisma.TransactionClient | typeof db,
  groupId: string,
  base: string,
): Promise<string> {
  const root = slugify(base) || "channel";
  let candidate = root;
  let i = 2;
  // `findFirst` + compound unique key on [groupId, slug].
  while (
    await client.channel.findUnique({
      where: { groupId_slug: { groupId, slug: candidate } },
      select: { id: true },
    })
  ) {
    candidate = `${root}-${i++}`;
    if (i > 50) {
      candidate = `${root}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

// ─── Eligibility ───────────────────────────────────────────────────────────

/**
 * Returns the userIds who should be ChatParticipants of the given channel.
 *
 *   PUBLIC / ANNOUNCEMENT → all ACTIVE group members.
 *   PRIVATE              → only users with a ChannelAccess row (and who are
 *                           also ACTIVE members of the group).
 *
 *   When the group has `tracksEnabled = true` AND the channel is linked to
 *   at least one Track via TrackChannel, the candidate set is further
 *   filtered to users on a matching track. Channels without any track
 *   linkage stay open to all eligible members regardless of track.
 */
export async function eligibleUserIdsForChannel(
  client: Prisma.TransactionClient | typeof db,
  channelId: string,
): Promise<string[]> {
  const channel = await client.channel.findUnique({
    where: { id: channelId },
    select: { groupId: true, kind: true, group: { select: { tracksEnabled: true } } },
  });
  if (!channel) return [];

  const active = await client.groupMembership.findMany({
    where: { groupId: channel.groupId, state: "ACTIVE" },
    select: { userId: true },
  });
  const activeSet = new Set(active.map((a) => a.userId));

  let candidates: string[];
  if (channel.kind === "PRIVATE") {
    const grants = await client.channelAccess.findMany({
      where: { channelId },
      select: { userId: true },
    });
    candidates = grants.map((g) => g.userId).filter((id) => activeSet.has(id));
  } else {
    candidates = Array.from(activeSet);
  }

  // Track gating layered on top: if enabled AND this channel is linked to
  // any track, narrow to users on a matching track.
  if (channel.group.tracksEnabled) {
    const trackLinks = await client.trackChannel.findMany({
      where: { channelId },
      select: { trackId: true },
    });
    if (trackLinks.length > 0) {
      const trackIds = trackLinks.map((l) => l.trackId);
      const trackMembers = await client.trackMember.findMany({
        where: { trackId: { in: trackIds }, userId: { in: candidates } },
        select: { userId: true },
      });
      const allowed = new Set(trackMembers.map((m) => m.userId));
      candidates = candidates.filter((u) => allowed.has(u));
    }
  }

  return candidates;
}

// ─── Thread provisioning ───────────────────────────────────────────────────

/** Create (or return existing) CHANNEL thread + backfill participants. */
export async function ensureChannelThread(
  client: Prisma.TransactionClient | typeof db,
  channelId: string,
): Promise<string> {
  let thread = await client.chatThread.findUnique({ where: { channelId } });
  if (!thread) {
    thread = await client.chatThread.create({
      data: { kind: "CHANNEL", channelId },
    });
  }
  // Delegate the participant backfill to the reconciler so reruns are safe.
  await syncChannelParticipants(client, channelId);
  return thread.id;
}

/**
 * Reconcile participants for a single channel's thread — adds missing rows
 * for currently-eligible users and removes rows for users no longer eligible.
 *
 * Safe to call from group-membership transitions; no-ops if nothing changes.
 */
export async function syncChannelParticipants(
  client: Prisma.TransactionClient | typeof db,
  channelId: string,
): Promise<void> {
  const thread = await client.chatThread.findUnique({
    where: { channelId },
    select: { id: true },
  });
  if (!thread) return;

  const [eligible, current] = await Promise.all([
    eligibleUserIdsForChannel(client, channelId),
    client.chatParticipant.findMany({
      where: { threadId: thread.id },
      select: { userId: true },
    }),
  ]);

  const eligibleSet = new Set(eligible);
  const currentSet = new Set(current.map((c) => c.userId));

  const toAdd = eligible.filter((u) => !currentSet.has(u));
  const toRemove = [...currentSet].filter((u) => !eligibleSet.has(u));

  if (toAdd.length > 0) {
    await client.chatParticipant.createMany({
      data: toAdd.map((userId) => ({ threadId: thread.id, userId })),
    });
  }
  if (toRemove.length > 0) {
    await client.chatParticipant.deleteMany({
      where: { threadId: thread.id, userId: { in: toRemove } },
    });
  }
}

/**
 * Reconcile participants for *all* channels in a group. Call after any change
 * to the user's group membership (join / leave / approve / ban) so per-channel
 * chat-thread membership stays truthful.
 */
export async function syncAllChannelsForGroup(
  client: Prisma.TransactionClient | typeof db,
  groupId: string,
): Promise<void> {
  const channels = await client.channel.findMany({
    where: { groupId, archived: false },
    select: { id: true },
  });
  for (const { id } of channels) {
    await syncChannelParticipants(client, id);
  }
}

// ─── Visibility ────────────────────────────────────────────────────────────

/**
 * Returns the set of channels visible to the user in a given group.
 * Honors PRIVATE channel grants.
 *
 * Track gating (M28): when the group has `tracksEnabled = true`, channels
 * linked to one or more Tracks are dropped from the result unless the user
 * is on a matching track. Channels with no track linkage stay open to all
 * eligible members.
 */
export async function listVisibleChannels(
  groupId: string,
  userId: string | undefined,
) {
  if (!userId) {
    return db.channel.findMany({
      where: { groupId, archived: false, kind: { not: "PRIVATE" } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { state: true },
  });
  if (!membership || membership.state !== "ACTIVE") {
    return db.channel.findMany({
      where: { groupId, archived: false, kind: { not: "PRIVATE" } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  const grantedPrivateIds = (
    await db.channelAccess.findMany({
      where: { userId, channel: { groupId } },
      select: { channelId: true },
    })
  ).map((g) => g.channelId);

  const baseChannels = await db.channel.findMany({
    where: {
      groupId,
      archived: false,
      OR: [
        { kind: { in: ["PUBLIC", "ANNOUNCEMENT"] } },
        { id: { in: grantedPrivateIds } },
      ],
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  // Track-gating filter (M28). Imported lazily to avoid a circular import
  // with src/server/tracks.ts (which imports syncAllChannelsForGroup).
  const { trackHiddenChannelIds } = await import("@/server/tracks");
  const hidden = await trackHiddenChannelIds({
    userId,
    groupId,
    candidateIds: baseChannels.map((c) => c.id),
  });
  if (hidden.size === 0) return baseChannels;
  return baseChannels.filter((c) => !hidden.has(c.id));
}
