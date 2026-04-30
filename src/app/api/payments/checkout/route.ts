/**
 * Checkout redirect — sends the member to the external Subscription-base
 * branded payment page (`/subscribe/:slug`) with their info prefilled.
 *
 * Usage: GET /api/payments/checkout?planId=<id>
 *
 * Auth: must be signed in. We look up the Plan, prefill name/email/phone
 * from the user record, and 302 to:
 *   <PAYMENT_SYSTEM_URL>/subscribe/<plan.externalProductSlug>?email=…&name=…&plan=…
 *
 * The Subscription-base side captures the payment, creates the
 * Subscription on its DB, and fires `payment_success` to our
 * /api/webhooks/payment endpoint, which activates the local sub.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const planId = req.nextUrl.searchParams.get("planId");
  if (!planId) {
    return NextResponse.json(
      { ok: false, error: "MISSING_PLAN_ID" },
      { status: 400 },
    );
  }

  const plan = await db.subscriptionPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      name: true,
      groupId: true,
      active: true,
      externalProductSlug: true,
      externalPlanType: true,
      externalProductId: true,
    },
  });
  if (!plan || !plan.active) {
    return NextResponse.json(
      { ok: false, error: "PLAN_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (!plan.externalProductSlug || !plan.externalPlanType) {
    return NextResponse.json(
      {
        ok: false,
        error: "PLAN_NOT_MAPPED_TO_PAYMENT_SYSTEM",
        hint: "Set External Product Slug + Plan Type on this Plan in admin → Plans.",
      },
      { status: 409 },
    );
  }

  const baseUrl = process.env.PAYMENT_SYSTEM_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, error: "PAYMENT_SYSTEM_URL_NOT_CONFIGURED" },
      { status: 500 },
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phone: true },
  });

  const url = new URL(`${baseUrl}/subscribe/${plan.externalProductSlug}`);
  if (user?.email) url.searchParams.set("email", user.email);
  if (user?.name) url.searchParams.set("name", user.name);
  if (user?.phone) url.searchParams.set("phone", user.phone);
  url.searchParams.set("plan", plan.externalPlanType);

  return NextResponse.redirect(url.toString(), 302);
}
