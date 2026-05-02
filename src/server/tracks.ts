/**
 * M28 — Tracks (cohorts) — utilities + core mutation helpers.
 *
 * A Track is a named cohort within a Group ("Beginner", "Advanced", etc).
 * Channels and courses can be linked to one or more tracks; when
 * Group.tracksEnabled = true, those resources are visible only to members
 * on a matching track. PUBLIC channels remain open to all active members
 * regardless of track — they serve as the welcome surface for unassigned
 * members.
 *
 * Visibility is computed VIRTUALLY in `hasAccess()` / `listVisibleChannels()`
 * rather than via fan-out MemberAccess GRANT rows, so admins can edit the
 * track ↔ channel link with a single row touch.
 *
 * Routing cascade for new ACTIVE memberships (see `routeNewMember`):
 *   1. Member has an active subscription on a Plan with `mappedTrackId`
 *      → assign that track.
 *   2. Group has a Track flagged `isDefault = true` → assign default.
 *   3. Otherwise → no track. Member sees only PUBLIC channels until an
 *      admin assigns one from the member panel.
 *
 * Server actions for the admin UI live in src/server/actions/tracks.ts —
 * do not import this file from a client component.
 */
import "server-only";
import { db } from "@/server/db";
import { syncAllChannelsForGroup } from "@/server/channels";
import type { Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient | typeof db;

// ─── Slug helper ───────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function uniqueTrackSlug(
  client: DbClient,
  groupId: string,
  base: string,
): Promise<string> {
  const root = slugify(base) || "track";
  let candidate = root;
  let i = 2;
  while (
    await client.track.findUnique({
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

// ─── Read helpers ──────────────────────────────────────────────────────────

/**
 * Returns the set of track IDs the user is on within a given group.
 * Cheap (one indexed query) — safe to call from access paths.
 */
export async function getUserTrackIds(params: {
  userId: string;
  groupId: string;
}): Promise<string[]> {
  const rows = await db.trackMember.findMany({
    where: { userId: params.userId, groupId: params.groupId },
    select: { trackId: true },
  });
  return rows.map((r) => r.trackId);
}

/**
 * Returns the user's primary visible track (lowest-positioned, non-archived).
 * Used to render the badge in the profile / member card.
 */
export async function getPrimaryTrack(params: {
  userId: string;
  groupId: string;
}) {
  const row = await db.trackMember.findFirst({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      track: { archived: false },
    },
    select: {
      track: {
        select: {
          id: true,
          slug: true,
          name: true,
          color: true,
          position: true,
        },
      },
    },
    orderBy: { track: { position: "asc" } },
  });
  return row?.track ?? null;
}

/**
 * For sidebar / channel-list filtering: given the set of channels already
 * fetched (e.g. from `listVisibleChannels`), return the IDs that are
 * track-gated AND not visible to this user. Caller drops/dims them.
 *
 * Returns an empty Set if track gating is disabled or no track linkages.
 */
export async function trackHiddenChannelIds(params: {
  userId: string;
  groupId: string;
  candidateIds: string[];
}): Promise<Set<string>> {
  if (params.candidateIds.length === 0) return new Set();

  const group = await db.group.findUnique({
    where: { id: params.groupId },
    select: { tracksEnabled: true },
  });
  if (!group || !group.tracksEnabled) return new Set();

  // Channels among the candidates that are linked to any track.
  const linkedRows = await db.trackChannel.findMany({
    where: { channelId: { in: params.candidateIds } },
    select: { channelId: true, trackId: true },
  });
  if (linkedRows.length === 0) return new Set();

  const linksByChannel = new Map<string, Set<string>>();
  for (const row of linkedRows) {
    if (!linksByChannel.has(row.channelId)) {
      linksByChannel.set(row.channelId, new Set());
    }
    linksByChannel.get(row.channelId)!.add(row.trackId);
  }

  const userTrackIds = new Set(
    await getUserTrackIds({ userId: params.userId, groupId: params.groupId }),
  );

  const hidden = new Set<string>();
  for (const [channelId, trackSet] of linksByChannel.entries()) {
    let onAny = false;
    for (const t of trackSet) {
      if (userTrackIds.has(t)) {
        onAny = true;
        break;
      }
    }
    if (!onAny) hidden.add(channelId);
  }
  return hidden;
}

// ─── Core: assignment & promotion ──────────────────────────────────────────

type AssignSource = "MANUAL" | "PLAN" | "DEFAULT";

/**
 * Assigns a user to a track, honoring the group's `trackPromotionMode`:
 *   • REPLACE — first removes the user's other track memberships in the
 *     same group, then adds the new one.
 *   • STACK   — keeps existing memberships and adds the new one alongside.
 *
 * Idempotent — if the user is already on the track we just touch
 * assignedAt; we never downgrade source from MANUAL to PLAN/DEFAULT.
 */
export async function assignTrackToUser(params: {
  userId: string;
  groupId: string;
  trackId: string;
  source: AssignSource;
  assignedById?: string | null;
  client?: DbClient;
}): Promise<void> {
  const client = params.client ?? db;

  const [track, group] = await Promise.all([
    client.track.findUnique({
      where: { id: params.trackId },
      select: { id: true, groupId: true, archived: true },
    }),
    client.group.findUnique({
      where: { id: params.groupId },
      select: { trackPromotionMode: true },
    }),
  ]);
  if (!track || track.groupId !== params.groupId) throw new Error("TRACK_NOT_FOUND");
  if (track.archived) throw new Error("TRACK_ARCHIVED");
  if (!group) throw new Error("GROUP_NOT_FOUND");

  if (group.trackPromotionMode === "REPLACE") {
    await client.trackMember.deleteMany({
      where: {
        userId: params.userId,
        groupId: params.groupId,
        NOT: { trackId: params.trackId },
      },
    });
  }

  await client.trackMember.upsert({
    where: { trackId_userId: { trackId: params.trackId, userId: params.userId } },
    update: { assignedAt: new Date() },
    create: {
      trackId: params.trackId,
      userId: params.userId,
      groupId: params.groupId,
      source: params.source,
      assignedById: params.assignedById ?? null,
    },
  });

  await syncAllChannelsForGroup(client, params.groupId);
}

/**
 * Removes a track assignment from a user.
 */
export async function removeTrackFromUser(params: {
  userId: string;
  groupId: string;
  trackId: string;
  client?: DbClient;
}): Promise<void> {
  const client = params.client ?? db;
  await client.trackMember.deleteMany({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      trackId: params.trackId,
    },
  });
  await syncAllChannelsForGroup(client, params.groupId);
}

/**
 * Cascade-route a newly ACTIVE member. Called from group join + approval
 * paths and from subscription activation. Idempotent.
 *
 * 1. If the user has an ACTIVE subscription on this group whose plan has a
 *    mappedTrackId → assign that track.
 * 2. Else if the group has a default track → assign it.
 * 3. Else: no-op (member stays unassigned, sees only PUBLIC channels).
 */
export async function routeNewMember(params: {
  userId: string;
  groupId: string;
  client?: DbClient;
}): Promise<void> {
  const client = params.client ?? db;

  const group = await client.group.findUnique({
    where: { id: params.groupId },
    select: { tracksEnabled: true },
  });
  if (!group || !group.tracksEnabled) return;

  // Don't override an existing track assignment.
  const existing = await client.trackMember.findFirst({
    where: { userId: params.userId, groupId: params.groupId },
    select: { id: true },
  });
  if (existing) return;

  // 1. Plan-mapped routing — only when the mapped track is still active.
  // (mappedTrackId is auto-nulled on track delete, but archive doesn't
  // null it; we have to filter explicitly.)
  const sub = await client.subscription.findFirst({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      status: "ACTIVE",
      currentPeriodEnd: { gt: new Date() },
    },
    include: {
      plan: {
        select: {
          mappedTrack: { select: { id: true, archived: true } },
        },
      },
    },
  });
  const planTrack = sub?.plan.mappedTrack;
  if (planTrack && !planTrack.archived) {
    await assignTrackToUser({
      userId: params.userId,
      groupId: params.groupId,
      trackId: planTrack.id,
      source: "PLAN",
      client,
    });
    return;
  }

  // 2. Default-track routing.
  const defaultTrack = await client.track.findFirst({
    where: { groupId: params.groupId, isDefault: true, archived: false },
    select: { id: true },
  });
  if (defaultTrack) {
    await assignTrackToUser({
      userId: params.userId,
      groupId: params.groupId,
      trackId: defaultTrack.id,
      source: "DEFAULT",
      client,
    });
  }
  // 3. No-op — member sees PUBLIC channels until admin assigns.
}
