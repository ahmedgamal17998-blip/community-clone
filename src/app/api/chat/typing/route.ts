/**
 * Typing-indicator endpoint (M15).
 * POST { threadId } — authed — triggers a "typing" event on the Pusher channel.
 * Client should debounce calls (800ms) before hitting this endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getPusherServer } from "@/lib/pusher-server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let threadId: string;
  try {
    const body = (await req.json()) as { threadId?: string };
    threadId = body.threadId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }

  // Verify the caller is a participant in this thread.
  const participant = await db.chatParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: session.user.id } },
    select: { threadId: true },
  });
  if (!participant) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const pusher = getPusherServer();
  if (pusher) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, handle: true },
    });
    await pusher
      .trigger(`private-thread-${threadId}`, "typing", {
        userId: session.user.id,
        handle: user?.handle ?? "someone",
        name: user?.name ?? null,
      })
      .catch(() => {
        /* ignore trigger errors — non-critical */
      });
  }

  return new NextResponse(null, { status: 204 });
}
