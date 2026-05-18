/**
 * POST /api/admin/tenant — Super-admin actions on a tenant.
 *
 * Supported actions:
 *   setPlan            — change plan tier, optionally set planStatus
 *   setSuspended       — permanent admin suspension (policy violation etc.)
 *   setPaused          — temporary pause (e.g. payment grace period)
 *   setActive          — restore from any non-active status
 *   setSubscriptionBase — toggle Subscription-base payment feature flag
 *
 * Pause vs Suspend:
 *   PAUSED    — workspace is frozen. Owner can still log in and view content
 *               but cannot create new groups/members. Auto-resolved when
 *               payment is received (billing webhook sets back to ACTIVE).
 *               Used by automated billing (past_due grace period).
 *   SUSPENDED — hard admin action. Owner sees a suspension notice.
 *               Must be manually lifted by a super-admin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSuperAdmin } from "@/server/super-admin";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isSuperAdmin(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    action: string;
    tenantId: string;
    plan?: string;
    planStatus?: string;
    enabled?: boolean;
  };

  const { action, tenantId } = body;

  if (action === "setPlan") {
    const plan = body.plan;
    const planStatus = body.planStatus ?? "ACTIVE";
    if (!["STARTER", "PRO", "BUSINESS"].includes(plan ?? "")) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    // When upgrading plan, also sync limits from PlanConfig defaults
    const planConfig = await db.planConfig.findUnique({ where: { plan: plan! } });
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        plan: plan!,
        planStatus,
        ...(planConfig ? {
          groupLimit:  planConfig.maxGroups          === -1 ? 9999 : planConfig.maxGroups,
          memberLimit: planConfig.maxMembersPerGroup  === -1 ? 9999 : planConfig.maxMembersPerGroup,
          courseLimit: planConfig.maxCourses          === -1 ? 9999 : planConfig.maxCourses,
        } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "setSuspended") {
    await db.tenant.update({
      where: { id: tenantId },
      data: { planStatus: "SUSPENDED" },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "setPaused") {
    await db.tenant.update({
      where: { id: tenantId },
      data: { planStatus: "PAST_DUE" }, // PAST_DUE = paused/grace state
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "setActive") {
    await db.tenant.update({
      where: { id: tenantId },
      data: { planStatus: "ACTIVE" },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "setSubscriptionBase") {
    const enabled = body.enabled ?? false;
    await db.tenant.update({
      where: { id: tenantId },
      data: { subscriptionBaseEnabled: enabled },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
