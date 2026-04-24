/**
 * Stripe server actions (M16).
 *
 * - createCheckoutSessionAction  — kick off Stripe Checkout for a PAID course
 * - getEnrollmentStatus          — check if a user is enrolled in a course
 * - adminGrantEnrollmentAction   — ADMIN+ free enrollment grant
 * - adminRevokeEnrollmentAction  — ADMIN+ revoke / refund enrollment
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { getStripeServer } from "@/lib/stripe";
import { getBaseUrl } from "@/lib/base-url";

// ─── Read helpers ──────────────────────────────────────────────────────────

export async function getEnrollmentStatus(userId: string, courseId: string) {
  return db.courseEnrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
}

// ─── Checkout ─────────────────────────────────────────────────────────────

export async function createCheckoutSessionAction(formData: FormData): Promise<
  | { ok: true; url: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthenticated" };

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { ok: false, error: "missing_course_id" };

  // Load course with group info.
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { group: { select: { id: true, slug: true } } },
  });
  if (!course) return { ok: false, error: "course_not_found" };
  if (course.priceType !== "PAID") return { ok: false, error: "not_paid_course" };

  // Check active membership.
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: course.groupId, userId: session.user.id } },
    select: { state: true },
  });
  if (!membership || membership.state !== "ACTIVE") {
    return { ok: false, error: "not_a_member" };
  }

  // Check for existing enrollment.
  const existing = await getEnrollmentStatus(session.user.id, course.id);
  if (existing && existing.status === "ACTIVE") {
    return { ok: false, error: "already_enrolled" };
  }

  // Graceful fallback when Stripe is not configured.
  const stripe = getStripeServer();
  if (!stripe) return { ok: false, error: "payments_not_configured" };

  if (!course.priceAmount && !course.stripePriceId) {
    return { ok: false, error: "price_not_set" };
  }

  const BASE_URL = getBaseUrl();
  const groupSlug = course.group.slug;
  const courseSlug = course.slug;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        ...(course.stripePriceId
          ? { price: course.stripePriceId }
          : {
              price_data: {
                currency: course.currency ?? "usd",
                unit_amount: course.priceAmount!,
                product_data: { name: course.title },
              },
            }),
      },
    ],
    metadata: {
      courseId: course.id,
      userId: session.user.id,
      groupId: course.groupId,
    },
    success_url: `${BASE_URL}/groups/${groupSlug}/learning/${courseSlug}?enrolled=1`,
    cancel_url: `${BASE_URL}/groups/${groupSlug}/learning/${courseSlug}`,
  });

  if (!checkoutSession.url) return { ok: false, error: "stripe_url_missing" };
  return { ok: true, url: checkoutSession.url };
}

// ─── Admin: grant free enrollment ─────────────────────────────────────────

export async function adminGrantEnrollmentAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthenticated" };

  const courseId = String(formData.get("courseId") ?? "").trim();
  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!courseId || !targetUserId) return { ok: false, error: "missing_fields" };

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { group: { select: { slug: true } } },
  });
  if (!course) return { ok: false, error: "course_not_found" };

  const adminMembership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: course.groupId, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!adminMembership || adminMembership.state !== "ACTIVE" || !hasMinRole(adminMembership.role as Role, "ADMIN")) {
    return { ok: false, error: "forbidden" };
  }

  await db.courseEnrollment.upsert({
    where: { userId_courseId: { userId: targetUserId, courseId: course.id } },
    create: {
      userId: targetUserId,
      courseId: course.id,
      groupId: course.groupId,
      status: "ACTIVE",
    },
    update: { status: "ACTIVE", refundedAt: null },
  });

  revalidatePath(`/groups/${course.group.slug}/learning/${course.slug}`);
  return { ok: true };
}

// ─── Admin: revoke enrollment ──────────────────────────────────────────────

export async function adminRevokeEnrollmentAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthenticated" };

  const enrollmentId = String(formData.get("enrollmentId") ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "missing_enrollment_id" };

  const enrollment = await db.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: { include: { group: { select: { slug: true } } } } },
  });
  if (!enrollment) return { ok: false, error: "enrollment_not_found" };

  const adminMembership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: enrollment.groupId, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!adminMembership || adminMembership.state !== "ACTIVE" || !hasMinRole(adminMembership.role as Role, "ADMIN")) {
    return { ok: false, error: "forbidden" };
  }

  await db.courseEnrollment.update({
    where: { id: enrollmentId },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });

  revalidatePath(`/groups/${enrollment.course.group.slug}/learning/${enrollment.course.slug}`);
  return { ok: true };
}
