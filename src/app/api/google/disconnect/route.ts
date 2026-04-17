import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { revokeAndDeleteGoogleAccount } from "@/server/google";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  await revokeAndDeleteGoogleAccount(session.user.id);
  return NextResponse.redirect(new URL("/settings/google?disconnected=1", req.url));
}
