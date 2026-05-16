/**
 * Points / Leaderboard layer (M12).
 *
 * Append-only ledger. Idempotency is enforced at the application layer by a
 * findFirst on (userId, groupId, reason, refType, refId) before insert.
 *
 * Earn rules:
 *   - POST                  +5  poster (post-actions.createPostAction)
 *   - COMMENT               +2  commenter (comment-actions.createCommentAction)
 *   - REACTION_GIVEN        +1  reactor (reaction-actions.toggleReactionAction)
 *   - REACTION_RECEIVED     +2  post author | +1 comment author
 *   - POST_COMMENT_RECEIVED +3  post author when someone comments
 *   - POST_SAVED            +5  post author when someone saves (save-actions)
 *   - LESSON_COMPLETED      +5  learner (courses.markLessonCompleteAction, first time only)
 *   - ADMIN_ADJUST          ±N  admin manual (with note)
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { requireRole } from "@/server/permissions";

export type PointsReason =
  | "POST"
  | "COMMENT"
  | "REACTION_GIVEN"
  | "REACTION_RECEIVED"
  | "POST_COMMENT_RECEIVED"
  | "POST_SAVED"
  | "LESSON_COMPLETED"
  | "DAILY_CHECK_IN"
  | "STREAK_BONUS"
  | "ADMIN_ADJUST";

export type Window = "7d" | "30d" | "all";

export type AddPointsInput = {
  userId: string;
  groupId: string;
  delta: number;
  reason: PointsReason;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
};

/** Insert a ledger row (idempotent on natural key). */
export async function addPoints(input: AddPointsInput) {
  if (!input.userId || !input.groupId || !Number.isFinite(input.delta)) return null;
  // Idempotency: only re-add for a given (user,group,reason,refType,refId) once.
  if (input.refType && input.refId && input.reason !== "ADMIN_ADJUST") {
    const existing = await db.pointsLedger.findFirst({
      where: {
        userId: input.userId,
        groupId: input.groupId,
        reason: input.reason,
        refType: input.refType,
        refId: input.refId,
      },
      select: { id: true },
    });
    if (existing) return existing;
  }
  return db.pointsLedger.create({
    data: {
      userId: input.userId,
      groupId: input.groupId,
      delta: input.delta,
      reason: input.reason,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      note: input.note ?? null,
    },
    select: { id: true },
  });
}

function windowStart(win: Window): Date | null {
  if (win === "all") return null;
  const now = Date.now();
  const ms = win === "7d" ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  return new Date(now - ms);
}

export async function getUserPoints(params: {
  userId: string;
  groupId: string;
  window: Window;
}): Promise<number> {
  const start = windowStart(params.window);
  const agg = await db.pointsLedger.aggregate({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      ...(start ? { createdAt: { gte: start } } : {}),
    },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

export type LeaderboardRow = {
  userId: string;
  points: number;
  rank: number;
  user: {
    id: string;
    name: string | null;
    handle: string;
    image: string | null;
  };
};

export async function getGroupLeaderboard(params: {
  groupId: string;
  window: Window;
  limit?: number;
  offset?: number;
}): Promise<LeaderboardRow[]> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const start = windowStart(params.window);

  const grouped = await db.pointsLedger.groupBy({
    by: ["userId"],
    where: {
      groupId: params.groupId,
      ...(start ? { createdAt: { gte: start } } : {}),
    },
    _sum: { delta: true },
    orderBy: { _sum: { delta: "desc" } },
    take: limit,
    skip: offset,
  });

  if (grouped.length === 0) return [];

  const userIds = grouped.map((g) => g.userId);
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, handle: true, image: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return grouped.map((g, i) => ({
    userId: g.userId,
    points: g._sum.delta ?? 0,
    rank: offset + i + 1,
    user: byId.get(g.userId) ?? {
      id: g.userId,
      name: null,
      handle: g.userId.slice(0, 8),
      image: null,
    },
  }));
}

// ─── Admin: manual adjust ──────────────────────────────────────────────────

const adjustSchema = z.object({
  groupId: z.string().cuid(),
  userId: z.string().cuid(),
  delta: z.coerce.number().int().min(-100000).max(100000),
  note: z.string().trim().min(1).max(500),
});

export async function adminAdjustPointsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = adjustSchema.safeParse({
    groupId: formData.get("groupId"),
    userId: formData.get("userId"),
    delta: formData.get("delta"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.pointsLedger.create({
    data: {
      userId: parsed.data.userId,
      groupId: parsed.data.groupId,
      delta: parsed.data.delta,
      reason: "ADMIN_ADJUST",
      refType: "manual",
      refId: null,
      note: parsed.data.note,
    },
  });

  const group = await db.group.findUnique({
    where: { id: parsed.data.groupId },
    select: { slug: true },
  });
  if (group) {
    revalidatePath(`/groups/${group.slug}/leaderboard`);
    revalidatePath(`/groups/${group.slug}/admin`);
  }
  return { ok: true as const };
}
