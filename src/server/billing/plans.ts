/**
 * Nadi SaaS — Tenant plan configurations.
 *
 * Single source of truth for plan limits used by the billing / limit
 * enforcement layer. Import from here (NOT from src/lib/plans.ts) inside
 * server actions that deal with Tenants — lib/plans.ts re-exports the same
 * types for client-safe use (no server-only imports).
 */

import type { Plan } from "@/lib/plans";

export type { Plan };

export interface TenantPlanLimits {
  label: string;
  maxGroups: number;          // -1 = unlimited
  maxMembersTotal: number;    // -1 = unlimited (across all groups in tenant)
  maxCourses: number;         // -1 = unlimited
  maxTeamMembers: number;     // admin seats (-1 = unlimited)
  maxStorageBytes: number;    // -1 = unlimited
  // Feature flags
  customDomain: boolean;
  whiteLabelBranding: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  sla: boolean;
}

export const TENANT_PLAN_LIMITS: Record<Plan, TenantPlanLimits> = {
  STARTER: {
    label: "Starter",
    maxGroups: 1,
    maxMembersTotal: 50,
    maxCourses: 1,
    maxTeamMembers: 0,
    maxStorageBytes: 1_073_741_824,   // 1 GB
    customDomain: false,
    whiteLabelBranding: false,
    advancedAnalytics: false,
    prioritySupport: false,
    sla: false,
  },
  PRO: {
    label: "Pro",
    maxGroups: 3,
    maxMembersTotal: 500,
    maxCourses: 10,
    maxTeamMembers: 3,
    maxStorageBytes: 16_106_127_360, // 15 GB
    customDomain: true,
    whiteLabelBranding: true,
    advancedAnalytics: true,
    prioritySupport: true,
    sla: false,
  },
  BUSINESS: {
    label: "Business",
    maxGroups: -1,
    maxMembersTotal: -1,
    maxCourses: -1,
    maxTeamMembers: 10,
    maxStorageBytes: 53_687_091_200, // 50 GB
    customDomain: true,
    whiteLabelBranding: true,
    advancedAnalytics: true,
    prioritySupport: true,
    sla: true,
  },
};
