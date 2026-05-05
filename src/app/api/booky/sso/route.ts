/**
 * POST /api/booky/sso
 *
 * Mints a short-lived SSO token authorizing the signed-in user to book a
 * specific BookingOffering on Booky. The request body is JSON:
 *
 *   { offeringId: string }
 *
 * The route looks up the offering, decides whether the user has access
 * (membership active + premium gate via `canBookOffering`), and signs a
 * token via `signBookySsoToken`. Booky verifies the token, pre-fills the
 * attendee form, and comps Premium offerings when `planAccess: true`.
 *
 * Returns 200 with `{ token, embedUrl }` so the embed page can iframe it.
 */
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { canBookOffering } from "@/server/booking-offerings";
import { signBookySsoToken } from "@/lib/booky-sso";

const BOOKY_BASE_URL =
  process.env.BOOKY_BASE_URL ??
  "https://booking.srv1575253.hstgr.cloud";

const DEFAULT_LOCALE = "en";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const offeringId =
    typeof (body as { offeringId?: unknown })?.offeringId === "string"
      ? (body as { offeringId: string }).offeringId
      : null;
  if (!offeringId) {
    return NextResponse.json({ error: "MISSING_OFFERING_ID" }, { status: 400 });
  }

  const offering = await db.bookingOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      groupId: true,
      tier: true,
      archived: true,
      instructorSlug: true,
      eventSlug: true,
    },
  });
  if (!offering || offering.archived) {
    return NextResponse.json({ error: "OFFERING_NOT_FOUND" }, { status: 404 });
  }

  // Must be an active member of the group.
  const me = await db.groupMembership.findUnique({
    where: {
      groupId_userId: {
        groupId: offering.groupId,
        userId: session.user.id,
      },
    },
    select: { state: true },
  });
  if (!me || me.state !== "ACTIVE") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // For PREMIUM offerings the token's `planAccess` flag tells Booky to
  // skip payment. For FREE offerings access is implied.
  const hasAccess = await canBookOffering({
    userId: session.user.id,
    groupId: offering.groupId,
    offeringId: offering.id,
  });
  if (!hasAccess) {
    return NextResponse.json({ error: "PAYWALLED" }, { status: 402 });
  }

  // Pull identity for the pre-fill payload.
  const me2 = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  if (!me2?.email) {
    return NextResponse.json(
      { error: "NO_EMAIL_ON_ACCOUNT" },
      { status: 400 },
    );
  }

  const planAccess = offering.tier === "PREMIUM"; // FREE doesn't need comping
  let token: string;
  try {
    token = signBookySsoToken({
      sub: session.user.id,
      name: me2.name ?? me2.email.split("@")[0],
      email: me2.email,
      instructorSlug: offering.instructorSlug,
      eventSlug: offering.eventSlug,
      planAccess,
      groupId: offering.groupId,
    });
  } catch (e) {
    // Most common failure: BOOKY_SSO_SECRET env var missing on the
    // deployment. Surface a clear message instead of an empty 500 body
    // so the booking page can render a useful error.
    const detail =
      e instanceof Error ? e.message : "Failed to mint SSO token";
    return NextResponse.json(
      { error: "SSO_CONFIG_MISSING", detail },
      { status: 500 },
    );
  }

  const embedUrl = `${BOOKY_BASE_URL}/${DEFAULT_LOCALE}/embed/${encodeURIComponent(
    offering.instructorSlug,
  )}/${encodeURIComponent(offering.eventSlug)}?sso=${encodeURIComponent(token)}`;

  return NextResponse.json({ token, embedUrl });
}
