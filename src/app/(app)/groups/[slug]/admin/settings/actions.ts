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
