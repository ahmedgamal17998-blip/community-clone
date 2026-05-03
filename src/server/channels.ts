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
 *   PRIVATE              → all ACTIVE admins (they manage every space)
 *                           plus any ACTIVE member with a grant via either
 *                           the legacy ChannelAccess table OR a non-expired
 *                           MemberAccess GRANT (from plans / trials / manual).
 *
 * This unified view replaces the M3 ChannelAccess-only path so members who
 * unlock a PRIVATE channel via a Plan automatically appear in its chat
 * participant list.
 */
export async function eligibleUserIdsForChannel(
  client: Prisma.TransactionClient | typeof db,
  channelId: string,
): Promise<string[]> {
  const channel = await client.channel.findUnique({
    where: { id: channelId },
    select: { groupId: true, kind: true },
  });
  if (!channel) return [];

  const active = await client.groupMembership.findMany({
    where: { groupId: channel.groupId, state: "ACTIVE" },
    select: { userId: true, role: true },
  });
  const activeSet = new Set(active.map((a) => a.userId));

  if (channel.kind !== "PRIVATE") {
    return Array.from(activeSet);
  }

  const adminIds = active
    .filter((m) => m.role === "ADMIN" || m.role === "OWNER")
    .map((m) => m.userId);

  const [legacyGrants, memberAccessGrants] = await Promise.all([
    client.channelAccess.findMany({
      where: { channelId },
      select: { userId: true },
    }),
    client.memberAccess.findMany({
      where: {
        resourceType: "CHANNEL",
        resourceId: channelId,
        mode: "GRANT",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { userId: true },
    }),
  ]);

  const granted = new Set<string>([
    ...adminIds,
    ...legacyGrants.map((g) => g.userId),
    ...memberAccessGrants.map((g) => g.userId),
  ]);

  return [...granted].filter((id) => activeSet.has(id));
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
 * Returns the channels that should appear in the user's sidebar for a given
 * group. M29 model:
 *
 *   • Admins (role >= ADMIN) always see ALL non-archived channels — they
 *     manage the space, so a freshly-created PRIVATE channel must show up
 *     in their own sidebar immediately.
 *   • Regular members see:
 *       - PUBLIC / ANNOUNCEMENT — always
 *       - PRIVATE + LOCKED_VISIBLE — always (rendered dimmed with a lock
 *         icon when the member has no access; click opens the paywall)
 *       - PRIVATE + HIDDEN — only when the member actually has access via
 *         any of the unified grant paths (MemberAccess GRANT, legacy
 *         ChannelAccess, group-level grant, or active subscription).
 *   • Logged-out / non-member viewers only see PUBLIC + ANNOUNCEMENT.
 *
 * The caller (group layout) still runs `hasAccessBulk` on the result to
 * compute the per-channel `locked` flag the sidebar uses for dimming.
 */
export async function listVisibleChannels(
  groupId: string,
  userId: string | undefined,
) {
  // Importing inline to avoid pulling permission helpers into edge bundles.
  const { hasMinRole } = await import("@/server/permissions");
  const { hasAccessBulk } = await import("@/server/access");

  const allChannels = await db.channel.findMany({
    where: { groupId, archived: false },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  if (!userId) {
    return allChannels.filter((c) => c.kind !== "PRIVATE");
  }

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true, state: true },
  });
  if (!membership || membership.state !== "ACTIVE") {
    return allChannels.filter((c) => c.kind !== "PRIVATE");
  }

  // Admins always see everything they could possibly manage.
  if (hasMinRole(membership.role as Parameters<typeof hasMinRole>[0], "ADMIN")) {
    return allChannels;
  }

  // For HIDDEN channels we need to consult the unified access resolver —
  // which honors MemberAccess GRANTs (from plans / manual / trial), the
  // legacy ChannelAccess table, and active subscriptions.
  const hiddenIds = allChannels
    .filter((c) => c.kind === "PRIVATE" && c.visibility === "HIDDEN")
    .map((c) => c.id);

  const hiddenAccess =
    hiddenIds.length > 0
      ? await hasAccessBulk({
          userId,
          groupId,
          resourceType: "CHANNEL",
          resourceIds: hiddenIds,
        })
      : new Map<string, boolean>();

  return allChannels.filter((c) => {
    if (c.kind !== "PRIVATE") return true;
    if (c.visibility === "LOCKED_VISIBLE") return true;
    return hiddenAccess.get(c.id) === true;
  });
}
