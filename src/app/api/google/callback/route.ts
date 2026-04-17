import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { exchangeCode, upsertGoogleAccount } from "@/server/google";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = req.cookies.get("g_oauth_state")?.value;

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return NextResponse.redirect(
      new URL("/settings/google?error=state", req.url),
    );
  }
  const [uid] = state.split(".");
  if (uid !== session.user.id) {
    return NextResponse.redirect(
      new URL("/settings/google?error=state", req.url),
    );
  }

  try {
    const { tokens, userInfo } = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // If Google didn't return a refresh token (user previously granted and
      // we sent prompt=consent but still nothing — rare) we can't persist.
      return NextResponse.redirect(
        new URL("/settings/google?error=no_refresh", req.url),
      );
    }
    await upsertGoogleAccount({
      userId: session.user.id,
      googleSub: userInfo.sub,
      email: userInfo.email,
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: new Date(
        tokens.expiry_date ?? Date.now() + 55 * 60 * 1000,
      ),
      scope: tokens.scope ?? "",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[google callback] exchange failed", err);
    return NextResponse.redirect(
      new URL("/settings/google?error=exchange", req.url),
    );
  }

  const res = NextResponse.redirect(
    new URL("/settings/google?connected=1", req.url),
  );
  res.cookies.delete("g_oauth_state");
  return res;
}
