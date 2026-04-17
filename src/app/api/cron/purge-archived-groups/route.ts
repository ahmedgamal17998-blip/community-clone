/**
 * Daily cron: hard-delete groups that have been soft-deleted for >30 days.
 * Auth: x-vercel-cron header OR Authorization Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { purgeExpiredGroupsAction } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const isVercelCron = req.headers.get("x-vercel-cron");
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const secretOk = secret && authHeader === `Bearer ${secret}`;
  if (!isVercelCron && !secretOk) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const res = await purgeExpiredGroupsAction();
  return NextResponse.json({ purged: res.purged });
}
