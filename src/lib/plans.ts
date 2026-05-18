/**
 * Nadi SaaS plan definitions.
 *
 * PLAN_DEFAULTS — static seed values used to initialise the PlanConfig DB table
 *                 on first run. After that, super-admin edits them at runtime.
 *
 * PLAN_CONFIGS  — kept for backwards-compat / synchronous checks.
 *                 Use getPlanConfigs() (server/plan-configs.ts) for live values.
 */

export type Plan = "STARTER" | "PRO" | "BUSINESS";

export interface PlanConfigDef {
  plan: Plan;
  label: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  maxGroups: number;          // -1 = unlimited
  maxMembersPerGroup: number; // -1 = unlimited
  maxCourses: number;         // -1 = unlimited
  maxTeamMembers: number;
  maxStorageGb: number;
  features: string[];
}

// ─── Seed defaults (source of truth for initial DB population) ───────────────

export const PLAN_DEFAULTS: PlanConfigDef[] = [
  {
    plan: "STARTER",
    label: "Starter",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    maxGroups: 1,
    maxMembersPerGroup: 50,
    maxCourses: 1,
    maxTeamMembers: 0,
    maxStorageGb: 1,
    features: [
      "1 group",
      "Up to 50 members",
      "1 course",
      "Posts, chat & events",
      "Basic analytics",
    ],
  },
  {
    plan: "PRO",
    label: "Pro",
    monthlyPriceCents: 2900,
    yearlyPriceCents: 29900,
    maxGroups: 3,
    maxMembersPerGroup: 500,
    maxCourses: 10,
    maxTeamMembers: 3,
    maxStorageGb: 15,
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
  {
    plan: "BUSINESS",
    label: "Business",
    monthlyPriceCents: 7900,
    yearlyPriceCents: 79900,
    maxGroups: -1,
    maxMembersPerGroup: -1,
    maxCourses: -1,
    maxTeamMembers: 10,
    maxStorageGb: 50,
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
];

// ─── Backwards-compat static map (synchronous limit checks) ──────────────────

export interface PlanConfig {
  label: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  price: string;
  maxGroups: number;
  maxMembersPerGroup: number;
  maxCourses: number;
  maxTeamMembers: number;
  maxStorageBytes: number;
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
    maxStorageBytes: 1_073_741_824,
    features: ["1 group", "Up to 50 members", "1 course"],
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
    maxStorageBytes: 16_106_127_360,
    features: ["Up to 3 groups", "Up to 500 members", "10 courses"],
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
    maxStorageBytes: 53_687_091_200,
    features: ["Unlimited groups", "Unlimited members", "Unlimited courses"],
  },
};

// ─── Helpers (use Tenant.groupLimit / memberLimit for live checks) ────────────

/** Check if a tenant on this plan can create another group. */
export function canCreateGroup(plan: Plan, currentGroupCount: number): boolean {
  const cfg = PLAN_CONFIGS[plan];
  if (cfg.maxGroups === -1) return true;
  return currentGroupCount < cfg.maxGroups;
}

/** Check if a group can accept one more member given the tenant plan. */
export function canAddMember(plan: Plan, currentMemberCount: number): boolean {
  const cfg = PLAN_CONFIGS[plan];
  if (cfg.maxMembersPerGroup === -1) return true;
  return currentMemberCount < cfg.maxMembersPerGroup;
}
