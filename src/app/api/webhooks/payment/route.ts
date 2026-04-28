/**
 * M18: Custom payment webhook.
 *
 * The user explicitly said they will integrate a custom in-house payment
 * system later (NOT Stripe). This route is the integration point.
 *
 * Expected payload (POST JSON):
 *   {
 *     "userId":   "...",
 *     "groupId":  "...",
 *     "planId":   "...",         // SubscriptionPlan to activate
 *     "externalRef": "...",      // payment-system tx id
 *     "amountCents": 2900,       // for audit
 *     "currency":   "usd"
 *   }
 *
 * Auth: shared secret in `x-payment-secret` header (env: PAYMENT_WEBHOOK_SECRET).
 */
import { NextResponse } from "next/server";
import { _activateSubscriptionInternal } from "@/server/actions/subscription";

export async function POST(req: Request) {
  const provided = req.headers.get("x-payment-secret");
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data = body as {
    userId?: string;
    groupId?: string;
    planId?: string;
    externalRef?: string;
  };

  if (!data.userId || !data.groupId || !data.planId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  try {
    const sub = await _activateSubscriptionInternal({
      userId: data.userId,
      groupId: data.groupId,
      planId: data.planId,
      externalRef: data.externalRef,
    });
    return NextResponse.json({ ok: true, subscriptionId: sub.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "activation_failed" },
      { status: 500 },
    );
  }
}
