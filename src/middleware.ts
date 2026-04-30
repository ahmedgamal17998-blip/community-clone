/**
 * Middleware — gates authenticated routes and prepares for future checks.
 *
 * We don't localize URLs (no `/en/...`, `/ar/...`) — locale is a cookie-driven
 * site-wide toggle, matching the target platform's behavior.
 */
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/verify",
];

const PUBLIC_PREFIXES = [
  "/api/auth",
  "/api/dev", // dev-only one-click sign-in — route itself gates on NODE_ENV
  "/_next",
  "/favicon",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Forward the current pathname as a request header so server components
  // can read the active route (e.g. TopNav showing the current group's
  // name in the switcher). Next.js doesn't expose URL info to RSCs by
  // default — middleware is the canonical bridge.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Presence of the session cookie = authenticated (full validation happens in
  // the RSC layer via `await auth()`; middleware avoids DB calls to stay fast).
  const sessionCookie =
    req.cookies.get("authjs.session-token") ??
    req.cookies.get("__Secure-authjs.session-token");

  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
