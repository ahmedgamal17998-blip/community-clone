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

async function uniqueCommunitySlug(base: string): Promise<string> {
  const root = base || "community";
  let candidate = root;
  let i = 2;
  while (await db.community.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${root}-${i++}`;
    if (i > 50) {
      candidate = `${root}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

// ─── Create community + group (wizard) ──────────────────────────────────────

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

  // SaaS gate: only users with canCreateGroups (paying subscribers / pre-
  // seeded owners) can create top-level communities. Members get a clear
  // error so the UI can surface it.
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { canCreateGroups: true },
  });
  if (!me?.canCreateGroups) {
    return {
      ok: false as const,
      error: "Creating a community requires an owner subscription. Contact support to upgrade.",
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
  const communitySlug = await uniqueCommunitySlug(base);

  // First-time community? Each group in M2 gets its own community container
  // by default. Later milestones may let admins nest groups under an existing
  // community — for now the wizard creates a 1:1 pair so ownership is clean.
  const group = await db.$transaction(async (tx) => {
    const community = await tx.community.create({
      data: {
        slug: communitySlug,
        name,
        description,
        primaryHsl,
        ownerId: session.user!.id,
      },
    });
    const group = await tx.group.create({
      data: {
        communityId: community.id,
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
    await syncAllChannelsForGroup(db, group.id);

    // Phase 1 monetization: grant a free trial if configured.
    // Implementation: a GROUP-level MemberAccess GRANT with expiresAt set
    // to (now + freeTrialDays). hasAccess() will treat them as having
    // full access until that date, then naturally fall back to per-
    // resource gating once the grant expires.
    if (
      isNewMember &&
      group.freeTrialDays != null &&
      group.freeTrialDays > 0
    ) {
      const expiresAt = new Date(
        Date.now() + group.freeTrialDays * 86_400_000,
      );
      try {
        await db.memberAccess.upsert({
          where: {
            userId_resourceType_resourceId: {
              userId: session.user.id,
              resourceType: "GROUP",
              resourceId: group.id,
            },
          },
          update: {
            mode: "GRANT",
            expiresAt,
            source: "RULE",
            note: "Free trial",
          },
          create: {
            userId: session.user.id,
            groupId: group.id,
            resourceType: "GROUP",
            resourceId: group.id,
            mode: "GRANT",
            expiresAt,
            source: "RULE",
            note: "Free trial",
          },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("free-trial grant failed", e);
      }
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

  const parsed = joinSchema.safeParse({ groupId: formData.get("groupId") });
  if (!parsed.success) return;

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: parsed.data.groupId, userId: session.user.id } },
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
    await db.groupMembership.update({
      where: { id: target.id },
      data: { state: "ACTIVE" },
    });
    await syncAllChannelsForGroup(db, target.groupId);
    try {
      const group = await db.group.findUnique({
        where: { id: target.groupId },
        select: { slug: true, name: true },
      });
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
