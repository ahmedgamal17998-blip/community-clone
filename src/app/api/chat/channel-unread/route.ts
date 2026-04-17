import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getChannelUnreadMap } from "@/server/chat";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "groupId required" }, { status: 400 });
  }
  const map = await getChannelUnreadMap(session.user.id, groupId);
  return NextResponse.json({ map });
}
