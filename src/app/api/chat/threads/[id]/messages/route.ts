import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { listMessages } from "@/server/chat";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const before = req.nextUrl.searchParams.get("before") ?? undefined;
  const after = req.nextUrl.searchParams.get("after") ?? undefined;
  const rows = await listMessages({
    threadId: params.id,
    userId: session.user.id,
    before,
    after,
  });
  return NextResponse.json({ rows });
}
