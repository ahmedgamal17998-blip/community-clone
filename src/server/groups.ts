/**
 * Group-related server actions (M2).
 *
 * Exposed via `"use server"` from form components. Each action:
 *  1. Asserts the session
 *  2. Validates input with Zod
 *  3. Enforces permissions via requireRole / ownership checks
 *  4. Mutates + revalidates the affected pages
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  requireRole,
  hasMinRole,
  type Role,
  VISIBILITIES,
  ROLES,
} from "@/server/permissions";
import { syncAllChannelsForGroup } from "@/server/channels";
import { createNotification } from "@/server/notifications";

/**
 * Free-trial helper. Creates / refreshes a GROUP-level MemberAccess
 * GRANT with `expiresAt = now + freeTrialDays`. The grant is a no-op
 * if the group has no trial configured. `hasAccess()` reads this row
 * to grant full access during the trial window, then naturally falls
 * back to per-resource gating once it expires.
 *
 * Called from:
 *  - joinGroupAction (PUBLIC groups, immediate ACTIVE)
 *  - decidePendingAction (PRIVATE groups, after admin approves)
 *  - the payment-webhook activation path doesn't need it (those
 *    members already get plan-bundled grants on payment).
 */
async function maybeGrantFreeTrial(params: {
  userId: string;
  groupId: string;
  freeTrialDays: number | null;
}) {
  if (params.freeTrialDays == null || params.freeTrialDays <= 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[free-trial] skip: groupId=${params.groupId} userId=${params.userId} freeTrialDays=${params.freeTrialDays}`,
    );
    return;
  }
  const expiresAt = new Date(
    Date.now() + params.freeTrialDays * 86_400_000,
  );
  try {
    const result = await db.memberAccess.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId: params.userId,
          resourceType: "GROUP",
          resourceId: params.groupId,
        },
      },
      update: {
        mode: "GRANT",
        expiresAt,
        source: "RULE",
        note: "Free trial",
      },
      create: {
        userId: params.userId,
        groupId: params.groupId,
        resourceType: "GROUP",
        resourceId: params.groupId,
        mode: "GRANT",
        expiresAt,
        source: "RULE",
        note: "Free trial",
      },
    });
    // eslint-disable-next-line no-console
    console.log(
      `[free-trial] granted: groupId=${params.groupId} userId=${params.userId} days=${params.freeTrialDays} expiresAt=${expiresAt.toISOString()} memberAccessId=${result.id}`,
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[free-trial] grant failed", {
      groupId: params.groupId,
      userId: params.userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ─── Slug helper ────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function uniqueGroupSlug(base: string): Promise<string> {
  const root = base || "group";
  let candidate = root;
  let i = 2;
  while (await db.group.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${root}-${i++}`;
    if (i > 50) {
      candidate = `${root}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

// ─── Create group under existing tenant ─────────────────────────────────────

// HSL triplet like "263 74% 58%"
const hslSchema = z
  .string()
  .regex(/^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/, "Use HSL triplet: 'H S% L%'");

const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(VISIBILITIES),
  primaryHsl: hslSchema,
});

export async function createGroupAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  // Require an existing tenant owned by this user
  const tenant = await db.tenant.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!tenant) {
    return {
      ok: false as const,
      error: "You need to set up a workspace first.",
    };
  }

  const parsed = createGroupSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    visibility: formData.get("visibility"),
    primaryHsl: formData.get("primaryHsl"),
  });

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, description, visibility, primaryHsl } = parsed.data;

  const base = slugify(name);
  const groupSlug = await uniqueGroupSlug(base);

  const group = await db.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        tenantId: tenant.id,
        slug: groupSlug,
        name,
        description,
        primaryHsl,
        visibility,
      },
    });
    await tx.groupMembership.create({
      data: {
        groupId: group.id,
        userId: session.user!.id,
        role: "OWNER",
        state: "ACTIVE",
      },
    });
    return group;
  });

  revalidatePath("/home");
  revalidatePath("/groups");
  redirect(`/groups/${group.slug}`);
}

// ─── Join / request to join ────────────────────────────────────────────────

const joinSchema = z.object({ groupId: z.string().cuid() });

export async function joinGroupAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = joinSchema.safeParse({ groupId: formData.get("groupId") });
  if (!parsed.success) return;

  const group = await db.group.findUnique({
    where: { id: parsed.data.groupId },
    select: {
      id: true,
      slug: true,
      visibility: true,
      freeTrialDays: true,
    },
  });
  if (!group) throw new Error("NOT_FOUND");
  if (group.visibility === "HIDDEN") throw new Error("FORBIDDEN");

  // PUBLIC → join directly; PRIVATE → REQUESTED state for admin approval.
  const state = group.visibility === "PUBLIC" ? "ACTIVE" : "REQUESTED";

  // Has the user joined this group before? We only want the free trial to
  // fire ONCE per (group, user) — re-joining shouldn't grant a fresh trial.
  const existing = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { id: true },
  });
  const isNewMember = !existing;

  await db.groupMembership.upsert({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    update: {}, // don't overwrite role/state if already exists
    create: {
      groupId: group.id,
      userId: session.user.id,
      role: "MEMBER",
      state,
    },
  });

  // Keep CHANNEL chat participants in sync whenever a new ACTIVE member appears.
  if (state === "ACTIVE") {
    // M28: route the new member through Plan→Track / default-track / pending
    // BEFORE the channel-participant sync so chat eligibility reflects their
    // track from the start. A misconfigured track must not block the join
    // itself — the member can still see PUBLIC channels and an admin can
    // assign a track from the member panel.
    if (isNewMember) {
      try {
        const { routeNewMember } = await import("@/server/tracks");
        await routeNewMember({ userId: session.user.id, groupId: group.id });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("routeNewMember failed on join", e);
      }
    }

    await syncAllChannelsForGroup(db, group.id);

    // Phase 1 monetization: grant a free trial if configured.
    if (isNewMember) {
      await maybeGrantFreeTrial({
        userId: session.user.id,
        groupId: group.id,
        freeTrialDays: group.freeTrialDays,
      });
    }
  }

  revalidatePath(`/groups/${group.slug}`);
  revalidatePath(`/groups/${group.slug}/members`);
  revalidatePath("/home");
}

// ─── Leave group ───────────────────────────────────────────────────────────

export async function leaveGroupAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  // Accept either groupId (canonical) or groupSlug (UserMenu uses this
  // because the avatar dropdown only knows the URL slug).
  const groupId = (formData.get("groupId") as string) || "";
  const groupSlug = (formData.get("groupSlug") as string) || "";

  let resolvedGroupId = groupId;
  if (!resolvedGroupId && groupSlug) {
    const g = await db.group.findUnique({
      where: { slug: groupSlug },
      select: { id: true },
    });
    if (!g) return;
    resolvedGroupId = g.id;
  }
  if (!resolvedGroupId) return;

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: resolvedGroupId, userId: session.user.id } },
    include: { group: { select: { slug: true } } },
  });
  if (!membership) return;
  if (membership.role === "OWNER") {
    throw new Error("OWNER_CANNOT_LEAVE"); // must transfer ownership first
  }

  await db.groupMembership.delete({ where: { id: membership.id } });
  await syncAllChannelsForGroup(db, membership.groupId);

  revalidatePath(`/groups/${membership.group.slug}`);
  revalidatePath("/home");
  redirect("/home");
}

// ─── Approve / reject pending request ──────────────────────────────────────

const decisionSchema = z.object({
  membershipId: z.string().cuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
});

export async function decidePendingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = decisionSchema.safeParse({
    membershipId: formData.get("membershipId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return;

  const target = await db.groupMembership.findUnique({
    where: { id: parsed.data.membershipId },
    include: { group: { select: { slug: true } } },
  });
  if (!target) return;

  await requireRole({ groupId: target.groupId, userId: session.user.id, min: "ADMIN" });

  if (parsed.data.decision === "APPROVE") {
    // Was the membership in REQUESTED state? If so, this is the user's
    // first ACTIVE moment in the group → fire the free-trial grant.
    const wasRequested = target.state === "REQUESTED";

    await db.groupMembership.update({
      where: { id: target.id },
      data: { state: "ACTIVE" },
    });

    // M28: route the newly-active member through track cascade BEFORE syncing
    // channel participants. Wrap in try/catch — a misconfigured track must
    // not block approving the membership.
    if (wasRequested) {
      try {
        const { routeNewMember } = await import("@/server/tracks");
        await routeNewMember({ userId: target.userId, groupId: target.groupId });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("routeNewMember failed on approval", e);
      }
    }

    await syncAllChannelsForGroup(db, target.groupId);

    // Fetch trial config + slug/name in one query.
    const group = await db.group.findUnique({
      where: { id: target.groupId },
      select: { slug: true, name: true, freeTrialDays: true },
    });

    // Trial: only on the REQUESTED → ACTIVE transition.
    if (wasRequested && group) {
      await maybeGrantFreeTrial({
        userId: target.userId,
        groupId: target.groupId,
        freeTrialDays: group.freeTrialDays,
      });
    }

    try {
      if (group) {
        await createNotification({
          userId: target.userId,
          actorId: session.user.id,
          type: "MEMBERSHIP_APPROVED",
          groupId: target.groupId,
          membershipId: target.id,
          snippet: `You've been approved to join ${group.name}`,
          href: `/groups/${group.slug}`,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("MEMBERSHIP_APPROVED notification failed", e);
    }
  } else {
    await db.groupMembership.delete({ where: { id: target.id } });
  }

  revalidatePath(`/groups/${target.group.slug}/members`);
}

// ─── Change role (admin+) ──────────────────────────────────────────────────

const changeRoleSchema = z.object({
  membershipId: z.string().cuid(),
  role: z.enum(ROLES),
});

export async function changeRoleAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = changeRoleSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return;

  const target = await db.groupMembership.findUnique({
    where: { id: parsed.data.membershipId },
    include: { group: { select: { slug: true } } },
  });
  if (!target) return;

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: target.groupId, userId: session.user.id } },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    throw new Error("FORBIDDEN");
  }

  // Guardrails:
  //  - Only OWNERs can promote to/demote OWNER.
  //  - You can't demote the last OWNER.
  const isOwnerChange =
    parsed.data.role === "OWNER" || target.role === "OWNER";
  if (isOwnerChange && me.role !== "OWNER") throw new Error("FORBIDDEN");

  if (target.role === "OWNER" && parsed.data.role !== "OWNER") {
    const owners = await db.groupMembership.count({
      where: { groupId: target.groupId, role: "OWNER", state: "ACTIVE" },
    });
    if (owners <= 1) throw new Error("CANNOT_REMOVE_LAST_OWNER");
  }

  await db.groupMembership.update({
    where: { id: target.id },
    data: { role: parsed.data.role },
  });

  revalidatePath(`/groups/${target.group.slug}/members`);
}

// ─── Ban / unban (admin+) ──────────────────────────────────────────────────

const banSchema = z.object({
  membershipId: z.string().cuid(),
  action: z.enum(["BAN", "UNBAN", "REMOVE"]),
});

export async function moderateMemberAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = banSchema.safeParse({
    membershipId: formData.get("membershipId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return;

  const target = await db.groupMembership.findUnique({
    where: { id: parsed.data.membershipId },
    include: { group: { select: { slug: true } } },
  });
  if (!target) return;

  await requireRole({ groupId: target.groupId, userId: session.user.id, min: "ADMIN" });

  if (target.role === "OWNER") throw new Error("CANNOT_MODERATE_OWNER");

  if (parsed.data.action === "REMOVE") {
    await db.groupMembership.delete({ where: { id: target.id } });
  } else {
    await db.groupMembership.update({
      where: { id: target.id },
      data: { state: parsed.data.action === "BAN" ? "BANNED" : "ACTIVE" },
    });
  }
  await syncAllChannelsForGroup(db, target.groupId);

  revalidatePath(`/groups/${target.group.slug}/members`);
}

// ─── Update group settings (owner/admin) ───────────────────────────────────

const updateGroupSchema = z.object({
  groupId: z.string().cuid(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(VISIBILITIES),
  primaryHsl: hslSchema,
});

export async function updateGroupAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = updateGroupSchema.safeParse({
    groupId: formData.get("groupId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    visibility: formData.get("visibility"),
    primaryHsl: formData.get("primaryHsl"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  const group = await db.group.update({
    where: { id: parsed.data.groupId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      visibility: parsed.data.visibility,
      primaryHsl: parsed.data.primaryHsl,
    },
  });

  revalidatePath(`/groups/${group.slug}`);
  revalidatePath(`/groups/${group.slug}/settings`);
  return { ok: true as const };
}
