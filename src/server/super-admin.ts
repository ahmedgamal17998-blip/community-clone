/**
 * Super-admin guard helpers.
 * Kept outside the layout file to satisfy Next.js route-module constraints
 * (layout.tsx may only export `default` and a few specific names).
 */
import { db } from "@/server/db";

/**
 * Returns true if the given userId has super-admin access.
 * Checks SUPER_ADMIN_EMAILS env var (comma-separated) then SUPER_ADMIN_ID fallback.
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const emails = process.env.SUPER_ADMIN_EMAILS ?? "";
  if (emails) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email && emails.split(",").map((e) => e.trim()).includes(user.email)) {
      return true;
    }
  }
  const hardcodedId = process.env.SUPER_ADMIN_ID ?? "";
  return hardcodedId === userId;
}
