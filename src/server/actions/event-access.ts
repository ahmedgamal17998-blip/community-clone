"use server";

import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";

type AudienceType = "ALL" | "CHANNEL" | "COURSE" | "ROLE_LEVEL" | "MEMBER";

export async function setEventAudienceModeAction(params: {
  groupId: string;
  eventId: string;
  audienceMode: "ALL" | "RESTRICTED";
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "EVENTS_MANAGE",
  });

  await db.event.update({
    where: { id: params.eventId },
    data: { audienceMode: params.audienceMode },
  });

  revalidatePath(`/groups/[slug]/events`, "page");
}

export async function addAudienceTargetAction(params: {
  groupId: string;
  eventId: string;
  type: AudienceType;
  channelId?: string;
  courseId?: string;
  minRole?: string;
  userId?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "EVENTS_MANAGE",
  });

  await db.eventAudience.create({
    data: {
      eventId: params.eventId,
      type: params.type,
      channelId: params.channelId ?? null,
      courseId: params.courseId ?? null,
      minRole: params.minRole ?? null,
      userId: params.userId ?? null,
    },
  });

  revalidatePath(`/groups/[slug]/events`, "page");
}

export async function removeAudienceTargetAction(params: {
  groupId: string;
  audienceId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "EVENTS_MANAGE",
  });

  await db.eventAudience.delete({ where: { id: params.audienceId } });
  revalidatePath(`/groups/[slug]/events`, "page");
}
