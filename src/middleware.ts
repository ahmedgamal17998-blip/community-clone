/**
 * Nadi Middleware — auth gate + subdomain tenant resolution.
 *
 * What this does:
 *  1. Extracts tenant context from the hostname and forwards it as headers:
 *       x-tenant-slug    — subdomain slug (e.g. "acme" from acme.nadi.app)
 *       x-custom-domain  — full custom domain (e.g. "academy.example.com")
 *       x-pathname       — current pathname (for server components that need the URL)
 *  2. Redirects unauthenticated requests to /login.
 *
 * Note: Prisma can NOT run on the Edge runtime, so we don't resolve the Tenant
 * row here. Headers from step 1 are read by server components / server actions
 * which resolve the Tenant via Prisma on the Node.js runtime.
 * See: src/lib/tenant-context.ts
 */
import { NextResponse, type NextRequest } from "next/server";

// ─── Platform config ─────────────────────────────────────────────────────────
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "nadi.app";
// Hostnames that are NOT tenant subdomains.
const PLATFORM_HOSTS = new Set([
  APP_DOMAIN,
  `www.${APP_DOMAIN}`,
  "localhost",
  "127.0.0.1",
]);

// ─── Public paths (no auth required) ─────────────────────────────────────────
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/start",
  "/verify",
  "/pricing",
];

const PUBLIC_PREFIXES = [
  "/api/auth",
  "/api/dev",
  "/api/cron",   // cron routes auth themselves via CRON_SECRET
  "/api/webhooks", // webhooks auth themselves via HMAC
  "/_next",
  "/favicon",
  "/c/",         // community landing pages are public
];

// ─── Middleware ───────────────────────────────────────────────────────────────

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  // Strip port from host for local dev (localhost:3000 → localhost)
  const hostname = host.split(":")[0]!;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  // ── Subdomain / custom-domain detection ────────────────────────────────────
  if (!PLATFORM_HOSTS.has(hostname)) {
    if (hostname.endsWith(`.${APP_DOMAIN}`)) {
      // e.g. acme.nadi.app → slug = "acme"
      const slug = hostname.slice(0, -(APP_DOMAIN.length + 1));
      if (slug && slug !== "www") {
        requestHeaders.set("x-tenant-slug", slug);
      }
    } else {
      // Fully custom domain (e.g. academy.example.com)
      requestHeaders.set("x-custom-domain", hostname);
    }
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────
  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

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
