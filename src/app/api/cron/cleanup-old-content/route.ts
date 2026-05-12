/**
 * Daily cron: delete old posts, channel chat messages, and DMs.
 *
 * Per-group content (posts + channel chat):
 *   Deleted when older than group.retentionDays.
 *   null = disabled for that group (keep forever).
 *
 * Direct messages (cross-group):
 *   Deleted when older than DM_RETENTION_DAYS env var (default 180).
 *   Always runs — not per-group.
 *
 * Auth: x-vercel-cron header OR Authorization Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

const DM_RETENTION_DAYS = parseInt(
  process.env.DM_RETENTION_DAYS ?? "180",
  10,
);

export async function GET(req: Request) {
  const isVercelCron = req.headers.get("x-vercel-cron");
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const secretOk = secret && authHeader === `Bearer ${secret}`;
  if (!isVercelCron && !secretOk) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const stats = {
    posts: 0,
    comments: 0,
    channelMessages: 0,
    dmMessages: 0,
  };

  // ── 1. Per-group: posts + channel chat ─────────────────────────────────
  const groups = await db.group.findMany({
    where: { retentionDays: { not: null }, deletedAt: null },
    select: { id: true, retentionDays: true },
  });

  for (const group of groups) {
    const cutoff = new Date(
      Date.now() - group.retentionDays! * 24 * 3600 * 1000,
    );

    // Delete old posts (cascade removes comments, reactions, saves, polls).
    const deletedPosts = await db.post.deleteMany({
      where: {
        channel: { groupId: group.id },
        createdAt: { lt: cutoff },
        pinned: false, // Never auto-delete pinned posts.
      },
    });
    stats.posts += deletedPosts.count;

    // Delete old channel chat messages (soft-delete → hard-delete).
    // We hard-delete directly since the UI hides soft-deleted messages.
    const deletedMsgs = await db.chatMessage.deleteMany({
      where: {
        thread: {
          groupId: group.id,
          kind: { in: ["GROUP", "CHANNEL"] },
        },
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
      where: {
        thread: { kind: "DIRECT" },
        createdAt: { lt: dmCutoff },
      },
    });
    stats.dmMessages += deletedDms.count;

    // Prune empty DM threads (all messages gone).
    await db.chatThread.deleteMany({
      where: {
        kind: "DIRECT",
        messages: { none: {} },
      },
    });
  }

  console.log("[cleanup-old-content]", JSON.stringify(stats));
  return NextResponse.json(stats);
}
