import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { auth } from "@/server/auth";
import { buildAuthUrl } from "@/server/google";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", _req.url));
  }
  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = `${session.user.id}.${nonce}`;
  const url = buildAuthUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
