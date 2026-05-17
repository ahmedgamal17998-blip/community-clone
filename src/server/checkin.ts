/**
 * Daily Group Check-in
 *
 * Records one check-in per user per group per cooldown window.
 * Awards points + tracks streak. All tuneable constants live at the top.
 */
"use server";

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { addPoints } from "@/server/points";
import { Prisma } from "@prisma/client";

// ─── Tune these to change behaviour — no need to touch the logic below ───────

/** Hours between allowed check-ins (default 24). */
const COOLDOWN_HOURS = 24;

/** If the gap since last check-in exceeds this, the streak resets to 1. */
const STREAK_BREAK_HOURS = 48;

/** Base points awarded for every successful daily check-in. */
const BASE_POINTS = 2;

/**
 * Streak milestone bonuses.
 * Format: [streakDays, bonusPoints]
 * User receives BASE_POINTS + bonusPoints on milestone days.
 */
const STREAK_MILESTONES: [days: number, bonus: number][] = [
  [3,   3],
  [7,   10],
  [14,  15],
  [30,  25],
  [100, 100],
];

// ─────────────────────────────────────────────────────────────────────────────

export type CheckInResult =
  | { awarded: false }
  | {
      awarded: true;
      streak: number;
      pointsEarned: number;
      isMilestone: boolean;
      milestoneBonus: number;
    };

/**
 * Call once per group page load (client mounts → fires once).
 * Safe to call multiple times — returns { awarded: false } if cooldown active.
 */
export async function dailyCheckInAction(params: {
  groupId: string;
}): Promise<CheckInResult> {
  const session = await auth();
  if (!session?.user?.id) return { awarded: false };

  const { groupId } = params;
  const userId = session.user.id;
  const now = new Date();
  const cooldownMs = COOLDOWN_HOURS * 3_600_000;
  const breakMs    = STREAK_BREAK_HOURS * 3_600_000;

  // ── 1. Check cooldown ──────────────────────────────────────────────────────
  const last = await db.memberCheckIn.findFirst({
    where: { userId, groupId },
    orderBy: { checkedAt: "desc" },
    select: { checkedAt: true, streak: true },
  });

  const msSinceLast = last ? now.getTime() - last.checkedAt.getTime() : Infinity;
  if (msSinceLast < cooldownMs) return { awarded: false };   // too soon

  // ── 2. Streak logic ────────────────────────────────────────────────────────
  const streakContinued = msSinceLast < breakMs;
  const newStreak = streakContinued ? (last!.streak + 1) : 1;

  // ── 3. Points calculation ──────────────────────────────────────────────────
  let milestoneBonus = 0;
  let isMilestone = false;
  for (const [days, bonus] of STREAK_MILESTONES) {
    if (newStreak === days) { milestoneBonus = bonus; isMilestone = true; break; }
  }
  const totalPoints = BASE_POINTS + milestoneBonus;

  // Cooldown bucket — used both as the DB uniqueness key and the points refId.
  // Declared here so it's available to both the MemberCheckIn create and addPoints.
  const bucket = Math.floor(now.getTime() / cooldownMs);

  // ── 4. Persist check-in ───────────────────────────────────────────────────
  // `bucket` enforces DB-level uniqueness per cooldown window, so concurrent
  // requests can't both write a check-in for the same window.
  try {
    await db.memberCheckIn.create({
      data: { userId, groupId, streak: newStreak, pointsEarned: totalPoints, bucket },
    });
  } catch (err) {
    // P2002 = unique(userId, groupId, bucket) violated by a concurrent request.
    // Another request won the race — this one is a no-op.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { awarded: false };
    }
    throw err;
  }

  // Also write to the admin-visible LoginHistory so admins can see daily visits.
  await db.loginHistory.create({
    data: { userId },
  }).catch(() => { /* non-critical */ });

  // ── 5. Award points ────────────────────────────────────────────────────────

  await addPoints({
    userId, groupId,
    delta: BASE_POINTS,
    reason: "DAILY_CHECK_IN",
    refType: "checkIn",
    refId: `${userId}:${groupId}:${bucket}`,
  }).catch((e) => console.error("addPoints (check-in) failed", e));

  // Milestone streak bonus — separate ledger entry so it's visible in history.
  if (isMilestone && milestoneBonus > 0) {
    await addPoints({
      userId, groupId,
      delta: milestoneBonus,
      reason: "STREAK_BONUS",
      refType: "checkIn",
      refId: `${userId}:${groupId}:streak:${newStreak}`,
    }).catch((e) => console.error("addPoints (streak bonus) failed", e));
  }

  return { awarded: true, streak: newStreak, pointsEarned: totalPoints, isMilestone, milestoneBonus };
}

/** Read the latest check-in for admin dashboards / profile display. */
export async function getCheckInStats(userId: string, groupId: string) {
  const last = await db.memberCheckIn.findFirst({
    where: { userId, groupId },
    orderBy: { checkedAt: "desc" },
    select: { checkedAt: true, streak: true },
  });
  if (!last) return null;
  return {
    lastCheckedAt: last.checkedAt,
    currentStreak: last.streak,
  };
}
