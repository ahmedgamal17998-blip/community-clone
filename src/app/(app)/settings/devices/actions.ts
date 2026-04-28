"use server";

import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { revalidatePath } from "next/cache";

export async function revokeSessionAction(params: { sessionId: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  // Only allow user to revoke their own sessions
  await db.session.deleteMany({
    where: { id: params.sessionId, userId: session.user.id },
  });

  revalidatePath("/settings/devices");
}
