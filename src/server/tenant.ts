/**
 * Tenant server actions — create, update, onboard.
 *
 * A Tenant is the top-level SaaS billing entity (one per workspace owner).
 * Creating a Tenant also creates the first Community + Group atomically.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { Prisma } from "@prisma/client";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  tenantName:     z.string().min(2).max(60),
  tenantSlug:     z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  communityName:  z.string().min(2).max(60),
  communitySlug:  z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  tagline:        z.string().max(120).optional(),
  groupName:      z.string().min(2).max(60),
  groupSlug:      z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  visibility:     z.enum(["PUBLIC", "PRIVATE", "HIDDEN"]).default("PUBLIC"),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type CreateTenantError  = { field?: string; message: string };

// ─── Create tenant + community + first group ─────────────────────────────────

export async function createTenantAction(
  raw: CreateTenantInput,
): Promise<{ ok: true; groupSlug: string } | { ok: false; error: CreateTenantError }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: { message: "Not authenticated" } };

  const parsed = CreateTenantSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0]!;
    return { ok: false, error: { field: first.path[0]?.toString(), message: first.message } };
  }

  const { tenantName, tenantSlug, communityName, communitySlug, tagline, groupName, groupSlug, visibility } =
    parsed.data;

  // Pre-flight uniqueness checks
  const [tenantExists, communityExists, groupExists] = await Promise.all([
    db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } }),
    db.community.findUnique({ where: { slug: communitySlug }, select: { id: true } }),
    db.group.findUnique({ where: { slug: groupSlug }, select: { id: true } }),
  ]);
  if (tenantExists)    return { ok: false, error: { field: "tenantSlug",    message: "Workspace URL already taken" } };
  if (communityExists) return { ok: false, error: { field: "communitySlug", message: "Community URL already taken" } };
  if (groupExists)     return { ok: false, error: { field: "groupSlug",     message: "Group URL already taken" } };

  // Calculate 14-day trial end
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 3_600_000);

  let redirectGroupSlug: string;
  try {
    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug:        tenantSlug,
          name:        tenantName,
          ownerId:     session.user.id,
          plan:        "STARTER",
          planStatus:  "TRIAL",
          trialEndsAt,
        },
      });

      const community = await tx.community.create({
        data: {
          slug:      communitySlug,
          name:      communityName,
          tagline:   tagline ?? null,
          ownerId:   session.user.id,
          tenantId:  tenant.id,
          plan:      "STARTER",
        },
      });

      const group = await tx.group.create({
        data: {
          communityId: community.id,
          slug:        groupSlug,
          name:        groupName,
          visibility,
        },
      });

      await tx.groupMembership.create({
        data: {
          groupId: group.id,
          userId:  session.user.id,
          role:    "OWNER",
          state:   "ACTIVE",
        },
      });

      // Increment tenant usage counter
      await tx.tenant.update({
        where: { id: tenant.id },
        data:  { currentGroups: 1 },
      });

      return { group };
    });
    redirectGroupSlug = result.group.slug;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String((err.meta as { target?: string[] })?.target ?? "");
      const field = target.includes("tenant")
        ? "tenantSlug"
        : target.includes("community")
        ? "communitySlug"
        : target.includes("group")
        ? "groupSlug"
        : undefined;
      return { ok: false, error: { field, message: "That URL is already taken — please choose another." } };
    }
    throw err;
  }

  redirect(`/groups/${redirectGroupSlug}`);
}

// ─── Update tenant settings ───────────────────────────────────────────────────

const UpdateTenantSchema = z.object({
  tenantId:     z.string().cuid(),
  name:         z.string().min(2).max(60).optional(),
  billingEmail: z.string().email().optional(),
  customDomain: z.string().max(253).optional().nullable(),
});

export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

export async function updateTenantAction(
  raw: UpdateTenantInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const parsed = UpdateTenantSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]!.message };

  const { tenantId, ...data } = parsed.data;

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { ownerId: true } });
  if (!tenant) return { ok: false, error: "Tenant not found" };
  if (tenant.ownerId !== session.user.id) return { ok: false, error: "Unauthorized" };

  try {
    await db.tenant.update({ where: { id: tenantId }, data });
    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "That custom domain is already in use." };
    }
    throw err;
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/** Fetch all tenants owned by a user (for the owner dashboard). */
export async function getOwnedTenants(userId: string) {
  return db.tenant.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      communities: {
        include: { _count: { select: { groups: true } } },
      },
      _count: { select: { paymentMethods: true } },
    },
  });
}

/** Fetch a single tenant with full details for the admin panel. */
export async function getTenantForAdmin(tenantId: string, userId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      communities: {
        include: {
          groups: {
            where: { deletedAt: null },
            include: { _count: { select: { memberships: { where: { state: "ACTIVE" } } } } },
          },
        },
      },
      paymentMethods: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!tenant) return null;
  if (tenant.ownerId !== userId) return null;
  return tenant;
}
