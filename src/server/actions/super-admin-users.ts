"use server";

import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/super-admin";
import { db } from "@/server/db";
import { revalidatePath } from "next/cache";

export async function deleteUserAction(
  userId: string,
): Promise<{ ok: true } | { error: "UNAUTHORIZED" | "NOT_FOUND" | "CANNOT_DELETE_SUPER_ADMIN" }> {
  const session = await auth();
  if (!session?.user?.id || !(await isSuperAdmin(session.user.id))) {
    return { error: "UNAUTHORIZED" };
  }

  // Prevent deleting yourself
  if (userId === session.user.id) {
    return { error: "CANNOT_DELETE_SUPER_ADMIN" };
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "NOT_FOUND" };

  // Cascade deletes handle all related rows (memberships, sessions, posts, etc.)
  await db.user.delete({ where: { id: userId } });

  revalidatePath("/super-admin/users");
  return { ok: true };
}
