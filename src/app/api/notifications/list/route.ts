import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getRecentNotifications } from "@/server/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const { unread, read } = await getRecentNotifications(session.user.id, 30);
  return NextResponse.json({
    rows: [...unread, ...read],
  });
}
