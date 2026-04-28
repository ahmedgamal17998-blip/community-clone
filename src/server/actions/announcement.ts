"use server";

import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";

export async function createAnnouncementAction(params: {
  groupId: string;
  title: string;
  body: string;
  ctaUrl?: string;
  durationSec: number;
  endsAt?: Date | null;
  audience?: "ALL" | "CHANNEL" | "ROLE";
  audienceRef?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "ANNOUNCEMENTS_SEND",
  });

  await db.adminAnnouncement.create({
    data: {
      groupId: params.groupId,
      title: params.title,
      body: params.body,
      ctaUrl: params.ctaUrl,
      durationSec: params.durationSec,
      endsAt: params.endsAt ?? null,
      audience: params.audience ?? "ALL",
      audienceRef: params.audienceRef,
      createdById: session.user.id,
    },
  });

  revalidatePath(`/groups/[slug]/admin/announcements`, "page");
}

export async function dismissAnnouncementAction(params: {
  announcementId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  await db.announcementSeen.upsert({
    where: {
      announcementId_userId: {
        announcementId: params.announcementId,
        userId: session.user.id,
      },
    },
    update: {},
    create: {
      announcementId: params.announcementId,
      userId: session.user.id,
    },
  });
}

export async function deleteAnnouncementAction(params: {
  groupId: string;
  announcementId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "ANNOUNCEMENTS_SEND",
  });

  await db.adminAnnouncement.delete({ where: { id: params.announcementId } });
  revalidatePath(`/groups/[slug]/admin/announcements`, "page");
}
