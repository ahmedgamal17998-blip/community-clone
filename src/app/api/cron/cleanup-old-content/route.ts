/**
 * Daily cron: delete old posts, channel chat messages, and DMs.
 *
 * Per-group content (posts + channel chat):
 *   1. If group.retentionDays is set  → use that value.
 *   2. If null                        → fall back to platform default
 *      (PlatformSetting "content.retentionDays", default 90 days).
 *   The platform default of 90 days is the SaaS-wide standard;
 *   individual groups can opt out by setting retentionDays = 0 (keep forever).
 *
 * Direct messages (cross-group):
 *   Deleted when older than DM_RETENTION_DAYS env var (default 180).
 *
 * Auth: Authorization Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getContentRetentionDays } from "@/server/platform-settings";

export const dynamic = "force-dynamic";

const DM_RETENTION_DAYS = parseInt(
  process.env.DM_RETENTION_DAYS ?? "180",
  10,
);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Read platform-wide default once per run.
  const platformRetentionDays = await getContentRetentionDays();

  const stats = {
    posts: 0,
    comments: 0,
    channelMessages: 0,
    dmMessages: 0,
  };

  // ── 1. Per-group content cleanup ────────────────────────────────────────
  // Fetch ALL active groups (not just those with explicit retentionDays set).
  // Groups with retentionDays = 0 are explicitly opted-out (keep forever).
  // Groups with retentionDays = null use the platform default.
  const groups = await db.group.findMany({
    where: {
      deletedAt: null,
      // retentionDays = 0 means "keep forever" — skip those
      NOT: { retentionDays: 0 },
    },
    select: { id: true, retentionDays: true },
  });

  for (const group of groups) {
    const days = group.retentionDays ?? platformRetentionDays;
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);

    const deletedPosts = await db.post.deleteMany({
      where: {
        channel: { groupId: group.id },
        createdAt: { lt: cutoff },
        pinned: false,
      },
    });
    stats.posts += deletedPosts.count;

    const deletedMsgs = await db.chatMessage.deleteMany({
      where: {
        thread: { groupId: group.id, kind: { in: ["GROUP", "CHANNEL"] } },
        createdAt: { lt: cutoff },
        pinned: false,
      },
    });
    stats.channelMessages += deletedMsgs.count;
  }

  // ── 2. Global DM cleanup ────────────────────────────────────────────────
  if (DM_RETENTION_DAYS > 0) {
    const dmCutoff = new Date(Date.now() - DM_RETENTION_DAYS * 24 * 3600 * 1000);
    const deletedDms = await db.chatMessage.deleteMany({
      where: { thread: { kind: "DIRECT" }, createdAt: { lt: dmCutoff } },
    });
    stats.dmMessages += deletedDms.count;

    await db.chatThread.deleteMany({
      where: { kind: "DIRECT", messages: { none: {} } },
    });
  }

  console.log("[cleanup-old-content]", JSON.stringify({ ...stats, platformRetentionDays }));
  return NextResponse.json(stats);
}
