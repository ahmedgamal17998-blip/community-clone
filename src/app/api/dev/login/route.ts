/**
 * DEV-ONLY one-click sign-in.
 *
 * Given `?email=alex@example.com`, creates a NextAuth database session for the
 * matching seed user, sets the `authjs.session-token` cookie, and redirects to `/`.
 *
 * Hard-gated on NODE_ENV !== "production" — production deploys will 404 this route.
 *
 * Intended for sharing a public tunnel / preview URL with testers who don't
 * have a mailbox hooked up. Do NOT remove the env gate.
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";

const SESSION_TTL_DAYS = 14;

/** NextAuth uses the __Secure- prefix on HTTPS (all Vercel deployments). */
function sessionCookieName(isHttps: boolean) {
  return isHttps ? "__Secure-authjs.session-token" : "authjs.session-token";
}

export async function GET(req: NextRequest) {
  const demoMode = process.env.DEMO_MODE === "1";
  if (process.env.NODE_ENV === "production" && !demoMode) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const email = url.searchParams.get("email")?.toLowerCase().trim();
  const next = url.searchParams.get("next") ?? "/";

  if (!email) {
    return NextResponse.json(
      {
        error: "missing email",
        hint: "append ?email=alex@example.com (or mona/samir/yara/chris/omar)",
      },
      { status: 400 },
    );
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "user not found", email }, { status: 404 });
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  const isHttps = url.protocol === "https:";
  const cookieName = sessionCookieName(isHttps);

  const redirectUrl = new URL(next, url.origin);
  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: isHttps,
  });
  return res;
}
