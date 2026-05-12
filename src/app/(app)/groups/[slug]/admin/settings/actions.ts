"use server";

import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/permissions";
import { revalidatePath } from "next/cache";

export async function setDefaultLandingAction(params: {
  groupId: string;
  defaultLandingPath: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireRole({
    groupId: params.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.group.update({
    where: { id: params.groupId },
    data: { defaultLandingPath: params.defaultLandingPath || null },
  });

  revalidatePath(`/groups/[slug]/admin/settings`, "page");
}

export async function setLoginPopupAction(params: {
  groupId: string;
  enabled: boolean;
  title: string | null;
  body: string | null;
  ctaUrl: string | null;
  durationSec: number;
  reshowHours: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireRole({
    groupId: params.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.group.update({
    where: { id: params.groupId },
    data: {
      loginPopupEnabled: params.enabled,
      loginPopupTitle: params.title || null,
      loginPopupBody: params.body || null,
      loginPopupCtaUrl: params.ctaUrl || null,
      loginPopupDurationSec: params.durationSec,
      loginPopupReshowHours: params.reshowHours,
    },
  });

  revalidatePath(`/groups/[slug]/admin/settings`, "page");
}

// Leave-attempt popup configuration.
export async function setLeavePopupAction(params: {
  groupId: string;
  enabled: boolean;
  body: string | null;
  fontFamily: string | null;
  fontSizePx: number | null;
  color: string | null;
  bold: boolean;
  stayLabel: string | null;
  leaveLabel: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireRole({
    groupId: params.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.group.update({
    where: { id: params.groupId },
    data: {
      leavePopupEnabled: params.enabled,
      leavePopupBody: params.body || null,
      leavePopupFontFamily: params.fontFamily || null,
      leavePopupFontSizePx: params.fontSizePx ?? null,
      leavePopupColor: params.color || null,
      leavePopupBold: params.bold,
      leavePopupStayLabel: params.stayLabel || null,
      leavePopupLeaveLabel: params.leaveLabel || null,
    },
  });

  revalidatePath(`/groups/[slug]/admin/settings`, "page");
}

// Phase 1: free trial setting. 0 / null = no trial.
export async function setFreeTrialDaysAction(params: {
  groupId: string;
  days: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireRole({
    groupId: params.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.group.update({
    where: { id: params.groupId },
    data: {
      freeTrialDays: params.days > 0 ? params.days : null,
    },
  });

  revalidatePath(`/groups/[slug]/admin/settings`, "page");
}

// Data retention: auto-delete posts + chat older than N days.  null = off.
export async function setRetentionDaysAction(params: {
  groupId: string;
  days: number | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireRole({
    groupId: params.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  await db.group.update({
    where: { id: params.groupId },
    data: {
      retentionDays: params.days && params.days > 0 ? params.days : null,
    },
  });

  revalidatePath(`/groups/[slug]/admin/settings`, "page");
}
