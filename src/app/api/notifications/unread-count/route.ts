import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getUnreadCount } from "@/server/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const count = await getUnreadCount(session.user.id);
  return NextResponse.json({ count });
}
