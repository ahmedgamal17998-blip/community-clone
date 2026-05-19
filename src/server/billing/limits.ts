/**
 * Nadi SaaS — Plan limit enforcement helpers.
 *
 * Call enforceLimit() / enforceFeature() inside server actions BEFORE writing
 * to the database. These throw typed errors that the action layer catches and
 * surfaces to the UI.
 *
 * Usage:
 *   await enforceLimit("groups", tenant);           // throws if at limit
 *   await enforceFeature("customDomain", tenant);   // throws if not on plan
 *   await incrementUsage("currentGroups", tenantId); // after successful create
 *   await decrementUsage("currentGroups", tenantId); // after delete
 */
"use server";

import { db } from "@/server/db";
import { TENANT_PLAN_LIMITS } from "@/server/billing/plans";
import type { Plan } from "@/lib/plans";
import { PlanLimitExceeded, FeatureNotAvailable } from "@/server/billing/errors";

// ─── Tenant fetcher (memoised per-request via unstable_cache in call sites) ──

export async function getTenantById(tenantId: string) {
  return db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      plan: true,
      planStatus: true,
      currentMembers: true,
      currentGroups: true,
      currentCourses: true,
      currentTeam: true,
      currentStorage: true,
      memberLimit: true,
      groupLimit: true,
      courseLimit: true,
      teamLimit: true,
      storageLimit: true,
    },
  });
}

// ─── Core enforcers ──────────────────────────────────────────────────────────

type LimitResource = "groups" | "members" | "courses" | "team" | "storage";
type FeatureKey = keyof Pick<
  (typeof TENANT_PLAN_LIMITS)[Plan],
  "customDomain" | "whiteLabelBranding" | "advancedAnalytics" | "prioritySupport" | "sla"
>;

/**
 * Throw PlanLimitExceeded if the Tenant is at (or over) their plan limit for
 * the given resource. Uses the Tenant's stored limit override first; falls back
 * to the plan default.
 */
export async function enforceLimit(
  resource: LimitResource,
  tenantId: string,
): Promise<void> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error("Tenant not found");

  const plan = tenant.plan as Plan;
  const planLimits = TENANT_PLAN_LIMITS[plan];

  let current: number;
  let limit: number;

  switch (resource) {
    case "groups":
      current = tenant.currentGroups;
      limit = tenant.groupLimit ?? planLimits.maxGroups;
      break;
    case "members":
      current = tenant.currentMembers;
      limit = tenant.memberLimit ?? planLimits.maxMembersTotal;
      break;
    case "courses":
      current = tenant.currentCourses;
      limit = tenant.courseLimit ?? planLimits.maxCourses;
      break;
    case "team":
      current = tenant.currentTeam;
      limit = tenant.teamLimit ?? planLimits.maxTeamMembers;
      break;
    case "storage":
      current = tenant.currentStorage;
      limit = tenant.storageLimit ?? planLimits.maxStorageBytes;
      break;
  }

  if (limit !== -1 && current >= limit) {
    throw new PlanLimitExceeded(resource, limit, plan);
  }
}

/** Throw FeatureNotAvailable if the Tenant's plan doesn't include a feature. */
export async function enforceFeature(
  feature: FeatureKey,
  tenantId: string,
): Promise<void> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error("Tenant not found");

  const plan = tenant.plan as Plan;
  const planLimits = TENANT_PLAN_LIMITS[plan];

  if (!planLimits[feature]) {
    throw new FeatureNotAvailable(feature, plan);
  }
}

// ─── Usage counters ──────────────────────────────────────────────────────────

type UsageField =
  | "currentMembers"
  | "currentGroups"
  | "currentCourses"
  | "currentTeam"
  | "currentStorage";

/** Atomically increment a usage counter. Call after a successful create. */
export async function incrementUsage(
  field: UsageField,
  tenantId: string,
  by = 1,
): Promise<void> {
  await db.tenant.update({
    where: { id: tenantId },
    data: { [field]: { increment: by } },
  });
}

/** Atomically decrement a usage counter. Call after a delete. Floors at 0. */
export async function decrementUsage(
  field: UsageField,
  tenantId: string,
  by = 1,
): Promise<void> {
  await db.$executeRaw`
    UPDATE "Tenant"
    SET "${field}" = GREATEST(0, "${field}" - ${by})
    WHERE id = ${tenantId}
  `;
}

/** Reconcile all usage counters for a Tenant from ground truth (DB counts). */
export async function reconcileUsage(tenantId: string): Promise<void> {
  const [memberCount, groupCount, courseCount] = await Promise.all([
    db.groupMembership.count({
      where: {
        group: { tenantId, deletedAt: null },
        state: "ACTIVE",
      },
    }),
    db.group.count({
      where: { tenantId, deletedAt: null },
    }),
    db.course.count({
      where: { group: { tenantId }, published: true },
    }),
  ]);

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      currentMembers: memberCount,
      currentGroups: groupCount,
      currentCourses: courseCount,
    },
  });
}
