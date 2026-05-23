"use server";

import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";

export async function saveOnboardingAction(params: {
  groupId: string;
  enabled: boolean;
  steps: Array<{ target: string; title: string; body: string; order: number; icon?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "ONBOARDING_EDIT",
  });

  await db.onboardingConfig.upsert({
    where: { groupId: params.groupId },
    update: {
      enabled: params.enabled,
      steps: JSON.stringify(params.steps),
    },
    create: {
      groupId: params.groupId,
      enabled: params.enabled,
      steps: JSON.stringify(params.steps),
    },
  });

  revalidatePath(`/groups/[slug]/admin/onboarding`, "page");
}

export async function markOnboardingCompleteAction(params: { groupId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  await db.groupMembership.updateMany({
    where: { groupId: params.groupId, userId: session.user.id },
    data: { onboardingCompletedAt: new Date() },
  });
}
