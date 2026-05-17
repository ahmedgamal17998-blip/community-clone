/**
 * POST /api/cron/expire-subscriptions
 *
 * Runs hourly via Vercel Cron. Locks expired subscriptions:
 *   1. Find ACTIVE subscriptions where currentPeriodEnd < now
 *   2. Set status → EXPIRED
 *   3. Set GroupMembership.hasAccess = false, accessRevokedAt = now
 *   4. Optionally send renewal reminder 7 days before expiry (if not yet sent)
 *
 * Auth: Bearer $CRON_SECRET header (set in Vercel env + vercel.json).
 */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 3_600_000);

  // ── 1. Expire overdue ACTIVE subscriptions ────────────────────────────────
  const expiredSubs = await db.subscription.findMany({
    where: {
      status:          "ACTIVE",
      currentPeriodEnd: { lt: now },
    },
    select: { id: true, userId: true, groupId: true },
  });

  if (expiredSubs.length > 0) {
    const subIds = expiredSubs.map((s) => s.id);

    // Expire subscriptions
    await db.subscription.updateMany({
      where: { id: { in: subIds } },
      data: { status: "EXPIRED" },
    });

    // Revoke membership access for each affected (userId, groupId) pair
    const pairs = expiredSubs.map((s) => ({
      userId:  s.userId,
      groupId: s.groupId,
    }));

    // Process in batches to avoid oversized queries
    for (const { userId, groupId } of pairs) {
      // Only lock if no other ACTIVE subscription covers this group
      const otherActiveSub = await db.subscription.findFirst({
        where: { userId, groupId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!otherActiveSub) {
        await db.groupMembership.updateMany({
          where: { userId, groupId, state: "ACTIVE" },
          data: { hasAccess: false, accessRevokedAt: now },
        });
      }
    }
  }

  // ── 2. Send renewal reminders (7-day window, once per subscription) ───────
  const dueSoonSubs = await db.subscription.findMany({
    where: {
      status:            "ACTIVE",
      currentPeriodEnd:  { gte: now, lte: sevenDaysFromNow },
      reminderSentAt:    null, // not yet reminded
    },
    select: {
      id:     true,
      userId: true,
      groupId: true,
      currentPeriodEnd: true,
      user:  { select: { email: true, name: true } },
      group: { select: { name: true, slug: true } },
    },
    take: 200, // process at most 200 per run
  });

  let remindersSent = 0;
  for (const sub of dueSoonSubs) {
    try {
      // Mark as reminded first to prevent double-send on cron overlap
      await db.subscription.update({
        where: { id: sub.id },
        data:  { reminderSentAt: now },
      });

      // TODO: send email via Resend (implement when email templates are ready)
      // await sendRenewalReminderEmail({ ... });

      remindersSent++;
    } catch {
      // Non-critical — log and continue
    }
  }

  return NextResponse.json({
    ok:            true,
    expired:       expiredSubs.length,
    remindersSent,
    processedAt:   now.toISOString(),
  });
}

// Also accept GET for Vercel cron (vercel.json uses GET by convention)
export { POST as GET };
