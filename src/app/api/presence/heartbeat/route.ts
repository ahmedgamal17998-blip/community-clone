import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const now = new Date();
  await db.presence.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, lastSeenAt: now, status: "ONLINE" },
    update: { lastSeenAt: now, status: "ONLINE" },
  });
  return new NextResponse(null, { status: 204 });
}
