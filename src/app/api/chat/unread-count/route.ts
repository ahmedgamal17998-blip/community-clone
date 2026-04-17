import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getInboxUnreadCount } from "@/server/chat";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const count = await getInboxUnreadCount(session.user.id);
  return NextResponse.json({ count });
}
