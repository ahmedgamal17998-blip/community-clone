/**
 * Cancel-subscription proxy — calls the external payment system's
 * `POST /api/subscriptions/:id/cancel` endpoint with our admin key.
 *
 * Usage: POST /api/payments/cancel  body: { subscriptionId: string }
 *
 * Auth: the requester must be the sub owner OR a group admin with
 * SUBS_MANAGE capability. We DO NOT cancel locally — we just call the
 * payment system. The payment system then fires `cancel_requested`
 * (which marks Subscription.cancelRequestedAt) and later `cancelled`
 * (which hard-cancels). This keeps the source of truth on the
 * payment-system side.
 *
 * For subs that have no externalSubscriptionId (manually granted by
 * an admin via /me, no payment), we hard-cancel locally instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { requireCapability } from "@/server/capabilities";
import {
  cancelSubscriptionAction,
  requestCancelSubscriptionAction,
} from "@/server/actions/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  let body: { subscriptionId?: string };
  try {
    body = (await req.json()) as { subscriptionId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }
  if (!body.subscriptionId) {
    return NextResponse.json(
      { ok: false, error: "MISSING_SUBSCRIPTION_ID" },
      { status: 400 },
    );
  }

  const sub = await db.subscription.findUnique({
    where: { id: body.subscriptionId },
    select: {
      id: true,
      userId: true,
      groupId: true,
      planId: true,
      externalSubscriptionId: true,
    },
  });
  if (!sub) {
    return NextResponse.json(
      { ok: false, error: "SUBSCRIPTION_NOT_FOUND" },
      { status: 404 },
    );
  }

  // Authorization
  if (session.user.id !== sub.userId) {
    try {
      await requireCapability({
        userId: session.user.id,
        groupId: sub.groupId,
        capability: "SUBS_MANAGE",
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403 },
      );
    }
  }

  // ─── No external sub ID → hard-cancel locally (admin grant case) ──
  if (!sub.externalSubscriptionId) {
    const res = await cancelSubscriptionAction({ subscriptionId: sub.id });
    return NextResponse.json(res);
  }

  // ─── Forward to the payment system ───────────────────────────────
  const baseUrl = process.env.PAYMENT_SYSTEM_URL?.replace(/\/$/, "");
  const adminKey = process.env.PAYMENT_SYSTEM_ADMIN_KEY;
  if (!baseUrl || !adminKey) {
    return NextResponse.json(
      { ok: false, error: "PAYMENT_SYSTEM_NOT_CONFIGURED" },
      { status: 500 },
    );
  }

  try {
    const upstream = await fetch(
      `${baseUrl}/api/subscriptions/${sub.externalSubscriptionId}/cancel`,
      {
        method: "POST",
        headers: {
          "x-admin-key": adminKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        {
          ok: false,
          error: "PAYMENT_SYSTEM_ERROR",
          status: upstream.status,
          body: text.slice(0, 500),
        },
        { status: 502 },
      );
    }

    // Mark cancel-requested locally as well, so the UI updates instantly.
    // The subsequent `cancel_requested` webhook from the payment system
    // is idempotent — it'll find cancelRequestedAt already set.
    await requestCancelSubscriptionAction({ subscriptionId: sub.id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "PAYMENT_SYSTEM_UNREACHABLE",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
