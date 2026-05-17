/**
 * POST /api/super-admin/notifications
 * Body: { target: "ALL" | "PLAN" | "SPECIFIC", plan?: string, tenantId?: string, message: string }
 * Creates a PLATFORM_NOTICE Notification row for each target owner.
 * Super-admin only.
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
    target: "ALL" | "PLAN" | "SPECIFIC";
    plan?: string;
    tenantId?: string;
    message: string;
  };

  const { target, plan, tenantId, message } = body;

  if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  // Find target tenant owners
  let ownerIds: string[] = [];

  if (target === "ALL") {
    const tenants = await db.tenant.findMany({ select: { ownerId: true } });
    ownerIds = [...new Set(tenants.map((t) => t.ownerId))];
  } else if (target === "PLAN" && plan) {
    const tenants = await db.tenant.findMany({
      where: { plan },
      select: { ownerId: true },
    });
    ownerIds = [...new Set(tenants.map((t) => t.ownerId))];
  } else if (target === "SPECIFIC" && tenantId) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { ownerId: true },
    });
    if (tenant) ownerIds = [tenant.ownerId];
  }

  if (ownerIds.length === 0) {
    return NextResponse.json({ error: "No recipients found", count: 0 });
  }

  // Batch-create notifications
  await db.notification.createMany({
    data: ownerIds.map((userId) => ({
      userId,
      actorId: session.user!.id,
      type:    "PLATFORM_NOTICE",
      snippet: message.slice(0, 300),
      href:    "/admin",
    })),
    skipDuplicates: false,
  });

  return NextResponse.json({ ok: true, count: ownerIds.length });
}
