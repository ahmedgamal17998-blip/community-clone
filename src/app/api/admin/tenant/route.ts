/**
 * POST /api/admin/tenant — Super-admin actions on a tenant.
 * Body: { action: "setPlan" | "setSuspended", tenantId, plan?, suspended? }
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
  };

  const { action, tenantId } = body;

  if (action === "setPlan") {
    const plan = body.plan;
    const planStatus = body.planStatus ?? "ACTIVE";
    if (!["STARTER","PRO","BUSINESS"].includes(plan ?? "")) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    await db.tenant.update({
      where: { id: tenantId },
      data: { plan: plan!, planStatus },
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

  if (action === "setActive") {
    await db.tenant.update({
      where: { id: tenantId },
      data: { planStatus: "ACTIVE" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
