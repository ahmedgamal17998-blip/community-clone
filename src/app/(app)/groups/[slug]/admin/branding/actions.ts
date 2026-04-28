"use server";

import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { requireCapability } from "@/server/capabilities";
import { revalidatePath } from "next/cache";

export async function setFaviconAction(params: {
  groupId: string;
  faviconUrl: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await requireCapability({
    userId: session.user.id,
    groupId: params.groupId,
    capability: "BRANDING_EDIT",
  });

  await db.group.update({
    where: { id: params.groupId },
    data: { faviconUrl: params.faviconUrl },
  });

  revalidatePath(`/groups/[slug]/admin/branding`, "page");
}
