"use server";

import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";

type RuleType = "CHANNEL" | "ROLE_LEVEL" | "TENURE" | "PAID" | "MANUAL";

export async function addRuleAction(params: {
  groupId: string;
  courseId: string;
  type: RuleType;
  channelId?: string;
  minRole?: string;
  tenureDays?: number;
  priceCents?: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "COURSES_MANAGE",
  });

  await db.courseAccessRule.create({
    data: {
      courseId: params.courseId,
      type: params.type,
      channelId: params.channelId ?? null,
      minRole: params.minRole ?? null,
      tenureDays: params.tenureDays ?? null,
      priceCents: params.priceCents ?? null,
    },
  });

  revalidatePath(`/groups/[slug]/admin/courses/[courseId]/access`, "page");
}

export async function removeRuleAction(params: {
  groupId: string;
  ruleId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "COURSES_MANAGE",
  });

  await db.courseAccessRule.delete({ where: { id: params.ruleId } });
  revalidatePath(`/groups/[slug]/admin/courses/[courseId]/access`, "page");
}

export async function manualGrantAction(params: {
  groupId: string;
  courseId: string;
  userId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "COURSES_MANAGE",
  });

  await db.courseManualGrant.upsert({
    where: {
      courseId_userId: { courseId: params.courseId, userId: params.userId },
    },
    update: {},
    create: { courseId: params.courseId, userId: params.userId },
  });

  revalidatePath(`/groups/[slug]/admin/courses/[courseId]/access`, "page");
}

export async function manualRevokeAction(params: {
  groupId: string;
  courseId: string;
  userId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "COURSES_MANAGE",
  });

  await db.courseManualGrant.deleteMany({
    where: { courseId: params.courseId, userId: params.userId },
  });

  revalidatePath(`/groups/[slug]/admin/courses/[courseId]/access`, "page");
}
