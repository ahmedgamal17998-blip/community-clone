/**
 * POST /api/stripe/checkout
 *
 * Thin authenticated wrapper around createCheckoutSessionAction.
 * Returns { url } on success; the client redirects to Stripe Checkout.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { createCheckoutSessionAction } from "@/server/stripe-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let courseId: string;
  try {
    const body = await req.json();
    courseId = String(body.courseId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!courseId) {
    return NextResponse.json({ error: "missing_course_id" }, { status: 400 });
  }

  const fd = new FormData();
  fd.set("courseId", courseId);

  const result = await createCheckoutSessionAction(fd);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ url: result.url });
}
