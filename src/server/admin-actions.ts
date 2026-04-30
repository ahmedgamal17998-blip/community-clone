/**
 * Admin-panel server actions (M12).
 *
 * Gates:
 *   - All mutations require ACTIVE ADMIN+ membership of the group.
 *   - Soft-delete / restore require OWNER.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  requireRole,
  ROLES,
  VISIBILITIES,
} from "@/server/permissions";
import { syncAllChannelsForGroup } from "@/server/channels";

// ─── Bulk member actions ──────────────────────────────────────────────────

const bulkSchema = z.object({
  groupId: z.string().cuid(),
  action: z.enum(["ROLE", "BAN", "UNBAN", "REMOVE"]),
  role: z.enum(ROLES).optional(),
  membershipIds: z.string(), // JSON-encoded string[]
});

export async function bulkMemberAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = bulkSchema.safeParse({
    groupId: formData.get("groupId"),
    action: formData.get("action"),
    role: formData.get("role") || undefined,
    membershipIds: formData.get("membershipIds"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  let ids: string[];
  try {
    ids = JSON.parse(parsed.data.membershipIds);
  } catch {
    return { ok: false as const, error: "Invalid membershipIds" };
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false as const, error: "No members selected" };
  }

  const me = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: parsed.data.groupId, userId: session.user.id },
    },
    select: { role: true },
  });
  const amOwner = me?.role === "OWNER";

  const targets = await db.groupMembership.findMany({
    where: { id: { in: ids }, groupId: parsed.data.groupId },
    select: { id: true, role: true, userId: true },
  });

  // Filter out OWNER targets from destructive ops and self-targeting.
  const safeTargets = targets.filter(
    (t) => t.role !== "OWNER" && t.userId !== session.user!.id,
  );

  if (parsed.data.action === "ROLE") {
    const role = parsed.data.role;
    if (!role) return { ok: false as const, error: "Missing role" };
    if (role === "OWNER" && !amOwner) {
      return { ok: false as const, error: "Only owners can assign OWNER" };
    }
    await db.$transaction(
      safeTargets.map((t) =>
        db.groupMembership.update({
          where: { id: t.id },
          data: { role },
        }),
      ),
    );
  } else if (parsed.data.action === "BAN") {
    await db.groupMembership.updateMany({
      where: { id: { in: safeTargets.map((t) => t.id) } },
      data: { state: "BANNED" },
    });
    await syncAllChannelsForGroup(db, parsed.data.groupId);
  } else if (parsed.data.action === "UNBAN") {
    await db.groupMembership.updateMany({
      where: { id: { in: safeTargets.map((t) => t.id) } },
      data: { state: "ACTIVE" },
    });
    await syncAllChannelsForGroup(db, parsed.data.groupId);
  } else if (parsed.data.action === "REMOVE") {
    await db.groupMembership.deleteMany({
      where: { id: { in: safeTargets.map((t) => t.id) } },
    });
    await syncAllChannelsForGroup(db, parsed.data.groupId);
  }

  const group = await db.group.findUnique({
    where: { id: parsed.data.groupId },
    select: { slug: true },
  });
  if (group) {
    revalidatePath(`/groups/${group.slug}/admin/members`);
    revalidatePath(`/groups/${group.slug}/members`);
  }
  return { ok: true as const, processed: safeTargets.length };
}

// ─── Channel ops ──────────────────────────────────────────────────────────

const reorderSchema = z.object({
  groupId: z.string().cuid(),
  items: z.string(), // JSON: { channelId, position }[]
});

export async function reorderChannelsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = reorderSchema.safeParse({
    groupId: formData.get("groupId"),
    items: formData.get("items"),
  });
  if (!parsed.success) return;

  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  let items: Array<{ channelId: string; position: number }>;
  try {
    items = JSON.parse(parsed.data.items);
  } catch {
    return;
  }
  if (!Array.isArray(items)) return;

  await db.$transaction(
    items.map((it) =>
      db.channel.update({
        where: { id: it.channelId },
        data: { position: Number(it.position) || 0 },
      }),
    ),
  );

  const group = await db.group.findUnique({
    where: { id: parsed.data.groupId },
    select: { slug: true },
  });
  if (group) {
    revalidatePath(`/groups/${group.slug}/admin/channels`);
    revalidatePath(`/groups/${group.slug}`);
  }
}

const setKindSchema = z.object({
  channelId: z.string().cuid(),
  kind: z.enum(["PUBLIC", "PRIVATE", "ANNOUNCEMENT"]),
});

export async function setChannelKindAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = setKindSchema.safeParse({
    channelId: formData.get("channelId"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) return;

  const channel = await db.channel.findUnique({
    where: { id: parsed.data.channelId },
    include: { group: { select: { slug: true } } },
  });
  if (!channel) return;

  await requireRole({
    groupId: channel.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.channel.update({
    where: { id: channel.id },
    data: { kind: parsed.data.kind },
  });

  revalidatePath(`/groups/${channel.group.slug}/admin/channels`);
}

// ── Phase 1: monetization tier toggle ─────────────────────────────────────

const setTierSchema = z.object({
  channelId: z.string().cuid(),
  tier: z.enum(["FREE", "PREMIUM"]),
});

export async function setChannelTierAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = setTierSchema.safeParse({
    channelId: formData.get("channelId"),
    tier: formData.get("tier"),
  });
  if (!parsed.success) return;

  const channel = await db.channel.findUnique({
    where: { id: parsed.data.channelId },
    include: { group: { select: { slug: true } } },
  });
  if (!channel) return;

  await requireRole({
    groupId: channel.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.channel.update({
    where: { id: channel.id },
    data: { tier: parsed.data.tier },
  });

  revalidatePath(`/groups/${channel.group.slug}/admin/channels`);
}

const setChannelChatEnabledSchema = z.object({
  channelId: z.string().cuid(),
  chatEnabled: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function setChannelChatEnabledAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = setChannelChatEnabledSchema.safeParse({
    channelId: formData.get("channelId"),
    chatEnabled: formData.get("chatEnabled"),
  });
  if (!parsed.success) return;

  const channel = await db.channel.findUnique({
    where: { id: parsed.data.channelId },
    include: { group: { select: { slug: true } } },
  });
  if (!channel) return;

  await requireRole({
    groupId: channel.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.channel.update({
    where: { id: channel.id },
    data: { chatEnabled: parsed.data.chatEnabled },
  });

  revalidatePath(`/groups/${channel.group.slug}/admin/channels`);
  revalidatePath(`/groups/${channel.group.slug}/channels/${channel.slug}`);
}

const setCourseTierSchema = z.object({
  courseId: z.string().cuid(),
  tier: z.enum(["FREE", "PREMIUM"]),
});

export async function setCourseTierAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = setCourseTierSchema.safeParse({
    courseId: formData.get("courseId"),
    tier: formData.get("tier"),
  });
  if (!parsed.success) return;

  const course = await db.course.findUnique({
    where: { id: parsed.data.courseId },
    include: { group: { select: { slug: true } } },
  });
  if (!course) return;

  await requireRole({
    groupId: course.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.course.update({
    where: { id: course.id },
    data: { tier: parsed.data.tier },
  });

  revalidatePath(`/groups/${course.group.slug}/learning`);
}

const toggleArchiveSchema = z.object({
  channelId: z.string().cuid(),
  archived: z.enum(["1", "0"]),
});

export async function toggleChannelArchiveAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = toggleArchiveSchema.safeParse({
    channelId: formData.get("channelId"),
    archived: formData.get("archived"),
  });
  if (!parsed.success) return;

  const channel = await db.channel.findUnique({
    where: { id: parsed.data.channelId },
    include: { group: { select: { slug: true } } },
  });
  if (!channel) return;

  await requireRole({
    groupId: channel.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.channel.update({
    where: { id: channel.id },
    data: { archived: parsed.data.archived === "1" },
  });

  revalidatePath(`/groups/${channel.group.slug}/admin/channels`);
  revalidatePath(`/groups/${channel.group.slug}`);
}

// ─── Branding ────────────────────────────────────────────────────────────

const hslSchema = z
  .string()
  .regex(/^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/, "Use HSL triplet: 'H S% L%'");

const brandingSchema = z.object({
  groupId: z.string().cuid(),
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  coverUrl: z.string().trim().url().optional().or(z.literal("")),
  primaryHsl: hslSchema,
});

export async function updateGroupBrandingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = brandingSchema.safeParse({
    groupId: formData.get("groupId"),
    logoUrl: formData.get("logoUrl") || "",
    coverUrl: formData.get("coverUrl") || "",
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
      logoUrl: parsed.data.logoUrl || null,
      coverUrl: parsed.data.coverUrl || null,
      primaryHsl: parsed.data.primaryHsl,
    },
  });

  revalidatePath(`/groups/${group.slug}`);
  revalidatePath(`/groups/${group.slug}/admin/branding`);
  return { ok: true as const };
}

// ─── Settings ────────────────────────────────────────────────────────────

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

const settingsSchema = z.object({
  groupId: z.string().cuid(),
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().min(2).max(48),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(VISIBILITIES),
  active: z.enum(["1", "0"]),
});

export async function updateGroupSettingsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = settingsSchema.safeParse({
    groupId: formData.get("groupId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    visibility: formData.get("visibility"),
    active: formData.get("active") ?? "1",
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  const nextSlug = slugify(parsed.data.slug) || parsed.data.slug;

  const current = await db.group.findUnique({
    where: { id: parsed.data.groupId },
    select: { slug: true },
  });
  if (!current) return { ok: false as const, error: "Group not found" };

  if (nextSlug !== current.slug) {
    const taken = await db.group.findUnique({
      where: { slug: nextSlug },
      select: { id: true },
    });
    if (taken) return { ok: false as const, error: "Slug already taken" };
  }

  const group = await db.group.update({
    where: { id: parsed.data.groupId },
    data: {
      name: parsed.data.name,
      slug: nextSlug,
      description: parsed.data.description,
      visibility: parsed.data.visibility,
      active: parsed.data.active === "1",
    },
  });

  revalidatePath(`/groups/${current.slug}`);
  revalidatePath(`/groups/${group.slug}`);
  revalidatePath(`/groups/${group.slug}/admin/settings`);
  return { ok: true as const, slug: group.slug };
}

// ─── Soft-delete / restore ───────────────────────────────────────────────

const groupIdSchema = z.object({ groupId: z.string().cuid() });

async function requireOwner(groupId: string, userId: string) {
  const m = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true, state: true },
  });
  if (!m || m.state !== "ACTIVE" || m.role !== "OWNER") {
    throw new Error("FORBIDDEN");
  }
}

export async function softDeleteGroupAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = groupIdSchema.safeParse({ groupId: formData.get("groupId") });
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };

  await requireOwner(parsed.data.groupId, session.user.id);

  const group = await db.group.update({
    where: { id: parsed.data.groupId },
    data: { deletedAt: new Date(), active: false },
  });

  revalidatePath(`/groups/${group.slug}`);
  revalidatePath(`/owner/archive`);
  revalidatePath(`/home`);
  return { ok: true as const };
}

export async function restoreGroupAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = groupIdSchema.safeParse({ groupId: formData.get("groupId") });
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };

  await requireOwner(parsed.data.groupId, session.user.id);

  const group = await db.group.update({
    where: { id: parsed.data.groupId },
    data: { deletedAt: null, active: true },
  });

  revalidatePath(`/groups/${group.slug}`);
  revalidatePath(`/owner/archive`);
  revalidatePath(`/home`);
  return { ok: true as const };
}

/**
 * Cron-callable helper. Hard-deletes groups that have been soft-deleted for
 * more than 30 days. No auth — caller (cron route) enforces.
 */
export async function purgeExpiredGroupsAction(): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const expired = await db.group.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (expired.length === 0) return { purged: 0 };
  const res = await db.group.deleteMany({
    where: { id: { in: expired.map((g) => g.id) } },
  });
  return { purged: res.count };
}

