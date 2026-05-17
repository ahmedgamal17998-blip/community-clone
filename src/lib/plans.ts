/**
 * Nadi SaaS plan definitions.
 *
 * These are the plans that Nadi charges workspace owners (Tenants).
 * They control how many groups, members, courses, etc. a Tenant can have.
 *
 * To change any limit, edit only this file — nothing else needs to change.
 *
 * Note: "Community plan" (on Community.plan) uses these same tier names
 * and mirrors the parent Tenant's plan for legacy group-level checks.
 */

export type Plan = "STARTER" | "PRO" | "BUSINESS";

export interface PlanConfig {
  label: string;
  monthlyPriceCents: number; // 0 = free / trial
  yearlyPriceCents: number;  // 0 = free / trial
  /** Display string, e.g. "$0/mo" */
  price: string;
  // Hard limits (-1 = unlimited)
  maxGroups: number;
  maxMembersPerGroup: number;
  maxCourses: number;
  maxTeamMembers: number;     // admin seats
  maxStorageBytes: number;    // -1 = unlimited
  features: string[];
}

export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  STARTER: {
    label: "Starter",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    price: "$0/mo",
    maxGroups: 1,
    maxMembersPerGroup: 50,
    maxCourses: 1,
    maxTeamMembers: 0,
    maxStorageBytes: 1_073_741_824, // 1 GB
    features: [
      "1 group",
      "Up to 50 members",
      "1 course",
      "Posts, chat & events",
      "Basic analytics",
    ],
  },
  PRO: {
    label: "Pro",
    monthlyPriceCents: 2900,
    yearlyPriceCents: 29900,
    price: "$29/mo",
    maxGroups: 3,
    maxMembersPerGroup: 500,
    maxCourses: 10,
    maxTeamMembers: 3,
    maxStorageBytes: 16_106_127_360, // 15 GB
    features: [
      "Up to 3 groups",
      "Up to 500 members",
      "10 courses",
      "Custom branding & domain",
      "Advanced analytics",
      "3 admin team seats",
      "Priority support",
    ],
  },
  BUSINESS: {
    label: "Business",
    monthlyPriceCents: 7900,
    yearlyPriceCents: 79900,
    price: "$79/mo",
    maxGroups: -1,
    maxMembersPerGroup: -1,
    maxCourses: -1,
    maxTeamMembers: 10,
    maxStorageBytes: 53_687_091_200, // 50 GB
    features: [
      "Unlimited groups",
      "Unlimited members",
      "Unlimited courses",
      "White-label & custom domain",
      "Full analytics & exports",
      "10 admin team seats",
      "Dedicated support",
      "SLA",
      "Custom integrations",
    ],
  },
};

/** Check if a community on this plan can create another group. */
export function canCreateGroup(plan: Plan, currentGroupCount: number): boolean {
  const cfg = PLAN_CONFIGS[plan];
  if (cfg.maxGroups === -1) return true;
  return currentGroupCount < cfg.maxGroups;
}

/** Check if a group can accept one more member given the community plan. */
export function canAddMember(plan: Plan, currentMemberCount: number): boolean {
  const cfg = PLAN_CONFIGS[plan];
  if (cfg.maxMembersPerGroup === -1) return true;
  return currentMemberCount < cfg.maxMembersPerGroup;
}
