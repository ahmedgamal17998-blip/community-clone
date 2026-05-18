/**
 * Plan configuration server actions.
 * Plans are stored in the DB so super-admins can edit them at runtime
 * without a redeploy.
 *
 * Call `ensurePlanConfigsSeeded()` once on first access to populate from defaults.
 */
"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/super-admin";
import { PLAN_DEFAULTS } from "@/lib/plans";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanConfigRow {
  id: string;
  plan: string;
  label: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  maxGroups: number;
  maxMembersPerGroup: number;
  maxCourses: number;
  maxTeamMembers: number;
  maxStorageGb: number;
  features: string[];   // parsed from JSON
  isVisible: boolean;
  sortOrder: number;
  updatedAt: Date;
}

// ─── Seed defaults if the table is empty ─────────────────────────────────────

export async function ensurePlanConfigsSeeded() {
  const count = await db.planConfig.count();
  if (count > 0) return;

  await db.planConfig.createMany({
    data: PLAN_DEFAULTS.map((d, i) => ({
      plan:               d.plan,
      label:              d.label,
      monthlyPriceCents:  d.monthlyPriceCents,
      yearlyPriceCents:   d.yearlyPriceCents,
      maxGroups:          d.maxGroups,
      maxMembersPerGroup: d.maxMembersPerGroup,
      maxCourses:         d.maxCourses,
      maxTeamMembers:     d.maxTeamMembers,
      maxStorageGb:       d.maxStorageGb,
      features:           JSON.stringify(d.features),
      isVisible:          true,
      sortOrder:          i,
    })),
    skipDuplicates: true,
  });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getPlanConfigs(): Promise<PlanConfigRow[]> {
  await ensurePlanConfigsSeeded();

  const rows = await db.planConfig.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return rows.map((r) => ({
    ...r,
    features: (() => {
      try { return JSON.parse(r.features) as string[]; }
      catch { return []; }
    })(),
  }));
}

// ─── Update (super-admin only) ────────────────────────────────────────────────

const UpdatePlanSchema = z.object({
  label:              z.string().min(1).max(50),
  monthlyPriceCents:  z.number().int().min(0),
  yearlyPriceCents:   z.number().int().min(0),
  maxGroups:          z.number().int().min(-1),
  maxMembersPerGroup: z.number().int().min(-1),
  maxCourses:         z.number().int().min(-1),
  maxTeamMembers:     z.number().int().min(0),
  maxStorageGb:       z.number().int().min(1),
  features:           z.array(z.string().min(1)).min(1),
  isVisible:          z.boolean(),
  sortOrder:          z.number().int().min(0),
});

export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;

export async function updatePlanConfigAction(
  plan: string,
  raw: UpdatePlanInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!(await isSuperAdmin(session.user.id))) return { ok: false, error: "Forbidden" };

  const parsed = UpdatePlanSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]!.message };

  const { features, ...rest } = parsed.data;

  await db.planConfig.update({
    where: { plan },
    data: { ...rest, features: JSON.stringify(features) },
  });

  return { ok: true };
}

// ─── Reset a plan to defaults ─────────────────────────────────────────────────

export async function resetPlanConfigAction(
  plan: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!(await isSuperAdmin(session.user.id))) return { ok: false, error: "Forbidden" };

  const def = PLAN_DEFAULTS.find((d) => d.plan === plan);
  if (!def) return { ok: false, error: "Unknown plan" };

  await db.planConfig.update({
    where: { plan },
    data: {
      label:              def.label,
      monthlyPriceCents:  def.monthlyPriceCents,
      yearlyPriceCents:   def.yearlyPriceCents,
      maxGroups:          def.maxGroups,
      maxMembersPerGroup: def.maxMembersPerGroup,
      maxCourses:         def.maxCourses,
      maxTeamMembers:     def.maxTeamMembers,
      maxStorageGb:       def.maxStorageGb,
      features:           JSON.stringify(def.features),
      isVisible:          true,
    },
  });

  return { ok: true };
}
