"use server";

/**
 * M28 — Track admin server actions.
 *
 * Pure server actions that the admin client UI calls. Logic implementation
 * lives in src/server/tracks.ts (which also exposes utility helpers used
 * by access / channel-visibility paths). This file is the only safe place
 * for client components to import from.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { syncAllChannelsForGroup } from "@/server/channels";
import {
  assignTrackToUser,
  removeTrackFromUser,
  uniqueTrackSlug,
} from "@/server/tracks";

async function getGroupSlug(groupId: string): Promise<string | null> {
  const g = await db.group.findUnique({
    where: { id: groupId },
    select: { slug: true },
  });
  return g?.slug ?? null;
}

const trackInputSchema = z.object({
  groupId: z.string().cuid(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  color: z
    .string()
    .regex(/^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/)
    .optional(),
  isDefault: z.boolean().optional(),
});

export async function createTrackAction(input: z.infer<typeof trackInputSchema>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = trackInputSchema.parse(input);
  await requireCapability({
    userId: session.user.id,
    groupId: parsed.groupId,
    capability: "TRACKS_MANAGE",
  });

  const slug = await uniqueTrackSlug(db, parsed.groupId, parsed.name);

  if (parsed.isDefault) {
    await db.track.updateMany({
      where: { groupId: parsed.groupId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const last = await db.track.findFirst({
    where: { groupId: parsed.groupId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const track = await db.track.create({
    data: {
      groupId: parsed.groupId,
      slug,
      name: parsed.name,
      description: parsed.description,
      color: parsed.color,
      isDefault: parsed.isDefault ?? false,
      position: (last?.position ?? -1) + 1,
    },
  });

  const groupSlug = await getGroupSlug(parsed.groupId);
  if (groupSlug) revalidatePath(`/groups/${groupSlug}/admin/tracks`);
  return track;
}

const updateTrackSchema = z.object({
  trackId: z.string().cuid(),
  groupId: z.string().cuid(),
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  color: z
    .string()
    .regex(/^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/)
    .optional()
    .nullable(),
  isDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function updateTrackAction(input: z.infer<typeof updateTrackSchema>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = updateTrackSchema.parse(input);
  await requireCapability({
    userId: session.user.id,
    groupId: parsed.groupId,
    capability: "TRACKS_MANAGE",
  });

  if (parsed.isDefault) {
    await db.track.updateMany({
      where: {
        groupId: parsed.groupId,
        isDefault: true,
        NOT: { id: parsed.trackId },
      },
      data: { isDefault: false },
    });
  }

  await db.track.update({
    where: { id: parsed.trackId },
    data: {
      name: parsed.name,
      description: parsed.description,
      color: parsed.color,
      isDefault: parsed.isDefault,
      archived: parsed.archived,
    },
  });

  const groupSlug = await getGroupSlug(parsed.groupId);
  if (groupSlug) revalidatePath(`/groups/${groupSlug}/admin/tracks`);
}

export async function deleteTrackAction(input: {
  trackId: string;
  groupId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: input.groupId,
    capability: "TRACKS_MANAGE",
  });
  await db.track.delete({ where: { id: input.trackId } });
  await syncAllChannelsForGroup(db, input.groupId);

  const groupSlug = await getGroupSlug(input.groupId);
  if (groupSlug) revalidatePath(`/groups/${groupSlug}/admin/tracks`);
}

const setLinksSchema = z.object({
  groupId: z.string().cuid(),
  trackId: z.string().cuid(),
  channelIds: z.array(z.string().cuid()).optional(),
  courseIds: z.array(z.string().cuid()).optional(),
});

export async function setTrackResourcesAction(input: z.infer<typeof setLinksSchema>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = setLinksSchema.parse(input);
  await requireCapability({
    userId: session.user.id,
    groupId: parsed.groupId,
    capability: "TRACKS_MANAGE",
  });

  await db.$transaction(async (tx) => {
    if (parsed.channelIds) {
      const channels = await tx.channel.findMany({
        where: { id: { in: parsed.channelIds }, groupId: parsed.groupId },
        select: { id: true },
      });
      const valid = new Set(channels.map((c) => c.id));
      await tx.trackChannel.deleteMany({ where: { trackId: parsed.trackId } });
      if (valid.size > 0) {
        await tx.trackChannel.createMany({
          data: Array.from(valid).map((channelId) => ({
            trackId: parsed.trackId,
            channelId,
          })),
        });
      }
    }

    if (parsed.courseIds) {
      const courses = await tx.course.findMany({
        where: { id: { in: parsed.courseIds }, groupId: parsed.groupId },
        select: { id: true },
      });
      const valid = new Set(courses.map((c) => c.id));
      await tx.trackCourse.deleteMany({ where: { trackId: parsed.trackId } });
      if (valid.size > 0) {
        await tx.trackCourse.createMany({
          data: Array.from(valid).map((courseId) => ({
            trackId: parsed.trackId,
            courseId,
          })),
        });
      }
    }
  });

  await syncAllChannelsForGroup(db, parsed.groupId);

  const groupSlug = await getGroupSlug(parsed.groupId);
  if (groupSlug) revalidatePath(`/groups/${groupSlug}/admin/tracks`);
}

const assignSchema = z.object({
  groupId: z.string().cuid(),
  userId: z.string().cuid(),
  trackId: z.string().cuid(),
});

export async function adminAssignTrackAction(input: z.infer<typeof assignSchema>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = assignSchema.parse(input);
  await requireCapability({
    userId: session.user.id,
    groupId: parsed.groupId,
    capability: "TRACKS_MANAGE",
  });

  await assignTrackToUser({
    userId: parsed.userId,
    groupId: parsed.groupId,
    trackId: parsed.trackId,
    source: "MANUAL",
    assignedById: session.user.id,
  });

  const groupSlug = await getGroupSlug(parsed.groupId);
  if (groupSlug) {
    revalidatePath(`/groups/${groupSlug}/admin/tracks`);
    revalidatePath(`/groups/${groupSlug}/admin/members`);
  }
}

export async function adminRemoveTrackAction(input: z.infer<typeof assignSchema>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = assignSchema.parse(input);
  await requireCapability({
    userId: session.user.id,
    groupId: parsed.groupId,
    capability: "TRACKS_MANAGE",
  });

  await removeTrackFromUser({
    userId: parsed.userId,
    groupId: parsed.groupId,
    trackId: parsed.trackId,
  });

  const groupSlug = await getGroupSlug(parsed.groupId);
  if (groupSlug) {
    revalidatePath(`/groups/${groupSlug}/admin/tracks`);
    revalidatePath(`/groups/${groupSlug}/admin/members`);
  }
}

const groupSettingsSchema = z.object({
  groupId: z.string().cuid(),
  tracksEnabled: z.boolean().optional(),
  trackPromotionMode: z.enum(["REPLACE", "STACK"]).optional(),
  trackBadgeVisible: z.boolean().optional(),
});

export async function updateTrackGroupSettingsAction(
  input: z.infer<typeof groupSettingsSchema>,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = groupSettingsSchema.parse(input);
  await requireCapability({
    userId: session.user.id,
    groupId: parsed.groupId,
    capability: "TRACKS_MANAGE",
  });

  await db.group.update({
    where: { id: parsed.groupId },
    data: {
      tracksEnabled: parsed.tracksEnabled,
      trackPromotionMode: parsed.trackPromotionMode,
      trackBadgeVisible: parsed.trackBadgeVisible,
    },
  });
  await syncAllChannelsForGroup(db, parsed.groupId);

  const groupSlug = await getGroupSlug(parsed.groupId);
  if (groupSlug) revalidatePath(`/groups/${groupSlug}/admin/tracks`);
}

const setPlanTrackSchema = z.object({
  groupId: z.string().cuid(),
  planId: z.string().cuid(),
  trackId: z.string().cuid().nullable(),
});

export async function setPlanMappedTrackAction(
  input: z.infer<typeof setPlanTrackSchema>,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const parsed = setPlanTrackSchema.parse(input);
  await requireCapability({
    userId: session.user.id,
    groupId: parsed.groupId,
    capability: "SUBS_MANAGE",
  });

  // Validate the track belongs to this group AND is not archived. Letting
  // an admin map a plan to an archived track would silently break future
  // subscribers' auto-routing.
  if (parsed.trackId) {
    const track = await db.track.findUnique({
      where: { id: parsed.trackId },
      select: { groupId: true, archived: true },
    });
    if (!track || track.groupId !== parsed.groupId) {
      throw new Error("TRACK_NOT_FOUND");
    }
    if (track.archived) {
      throw new Error("TRACK_ARCHIVED");
    }
  }

  await db.subscriptionPlan.update({
    where: { id: parsed.planId },
    data: { mappedTrackId: parsed.trackId },
  });

  const groupSlug = await getGroupSlug(parsed.groupId);
  if (groupSlug) {
    revalidatePath(`/groups/${groupSlug}/admin/plans`);
    revalidatePath(`/groups/${groupSlug}/admin/tracks`);
  }
}
