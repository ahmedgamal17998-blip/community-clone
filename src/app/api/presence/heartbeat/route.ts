import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getPusherServer } from "@/lib/pusher-server";

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

  // M15: broadcast presence update to all groups this user is an active member of.
  const pusher = getPusherServer();
  if (pusher) {
    const memberships = await db.groupMembership.findMany({
      where: { userId: session.user.id, state: "ACTIVE" },
      select: { groupId: true },
    });
    await Promise.all(
      memberships.map((m) =>
        pusher
          .trigger(`presence-group-${m.groupId}`, "presence-updated", {
            userId: session.user.id,
            status: "ONLINE",
          })
          .catch(() => {
            /* ignore — non-critical */
          }),
      ),
    );
  }

  return new NextResponse(null, { status: 204 });
}
