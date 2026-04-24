/**
 * Stripe webhook receiver (M16).
 *
 * Handles checkout.session.completed to fulfill course enrollments.
 * Requires STRIPE_WEBHOOK_SECRET to be set — returns 400 if not (security).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { getStripeServer } from "@/lib/stripe";
import { createNotification } from "@/server/notifications";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 400 },
    );
  }

  const stripe = getStripeServer();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    const rawBody = await req.arrayBuffer();
    event = stripe.webhooks.constructEvent(Buffer.from(rawBody), sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { courseId, userId, groupId } = session.metadata ?? {};

    if (!courseId || !userId || !groupId) {
      // Missing metadata — skip silently.
      return NextResponse.json({ received: true });
    }

    const amountPaid = session.amount_total ?? null;
    const currency = session.currency ?? "usd";
    const stripeSessionId = session.id;

    // Upsert enrollment.
    await db.courseEnrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: {
        userId,
        courseId,
        groupId,
        stripeSessionId,
        status: "ACTIVE",
        amountPaid,
        currency,
      },
      update: {
        status: "ACTIVE",
        stripeSessionId,
        amountPaid,
        currency,
        refundedAt: null,
      },
    });

    // Fire COURSE_ENROLLED notification.
    const course = await db.course.findUnique({
      where: { id: courseId },
      include: { group: { select: { slug: true } } },
    });
    if (course) {
      await createNotification({
        userId,
        type: "COURSE_ENROLLED",
        groupId,
        snippet: `You are now enrolled in "${course.title}"`,
        href: `/groups/${course.group.slug}/learning/${course.slug}?enrolled=1`,
      }).catch(() => {
        /* non-fatal */
      });
    }
  }

  return NextResponse.json({ received: true });
}
