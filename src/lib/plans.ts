/**
 * SaaS plan definitions.
 *
 * To change any limit, edit only this file — nothing else needs to change.
 */

export type Plan = "FREE" | "PRO" | "ENTERPRISE";

export interface PlanConfig {
  label: string;
  price: string;        // Display string, e.g. "$0/mo"
  maxGroups: number;    // -1 = unlimited
  maxMembersPerGroup: number; // -1 = unlimited
  features: string[];
}

export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  FREE: {
    label: "Free",
    price: "$0/mo",
    maxGroups: 1,
    maxMembersPerGroup: 100,
    features: [
      "1 group",
      "Up to 100 members",
      "Posts, chat & courses",
      "Basic analytics",
    ],
  },
  PRO: {
    label: "Pro",
    price: "$29/mo",
    maxGroups: -1,
    maxMembersPerGroup: -1,
    features: [
      "Unlimited groups",
      "Unlimited members",
      "Custom branding & domain",
      "Advanced analytics",
      "Priority support",
    ],
  },
  ENTERPRISE: {
    label: "Enterprise",
    price: "Custom",
    maxGroups: -1,
    maxMembersPerGroup: -1,
    features: [
      "Everything in Pro",
      "White-label",
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
