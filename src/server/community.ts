"use server";
import { db } from "@/server/db";
import { canCreateGroup } from "@/lib/plans";
import type { Plan } from "@/lib/plans";

export async function assertCanCreateGroup(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, _count: { select: { groups: { where: { deletedAt: null } } } } },
  });
  if (!tenant) throw new Error("Tenant not found");
  if (!canCreateGroup(tenant.plan as Plan, tenant._count.groups)) {
    throw new Error(`Your ${tenant.plan} plan limit reached. Upgrade to create more groups.`);
  }
}
