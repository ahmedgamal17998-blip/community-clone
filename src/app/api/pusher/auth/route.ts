/**
 * Pusher channel-auth endpoint (M15).
 * Required for private- and presence- channels.
 * Returns HTTP 200 with Pusher auth payload, or 403 if unauthenticated.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getPusherServer } from "@/lib/pusher-server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 403 });
  }

  const pusher = getPusherServer();
  if (!pusher) {
    return NextResponse.json(
      { error: "Pusher not configured" },
      { status: 503 },
    );
  }

  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id");
  const channelName = params.get("channel_name");

  if (!socketId || !channelName) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  try {
    const authResponse = pusher.authorizeChannel(socketId, channelName);
    return NextResponse.json(authResponse);
  } catch {
    return NextResponse.json({ error: "Auth failed" }, { status: 403 });
  }
}
