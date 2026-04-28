/**
 * M20: Device session limit (max 2 simultaneous active sessions per user).
 *
 * On sign-in: count this user's active (non-expired) sessions. If over the cap,
 * delete the oldest ones until under cap. Also annotate the new session with
 * its user-agent + IP for the /settings/devices page.
 */
import { db } from "@/server/db";

const MAX_SESSIONS_PER_USER = 2;

export async function enforceSessionLimit(params: {
  userId: string;
  newSessionId?: string;
  userAgent?: string;
  ip?: string;
}) {
  const now = new Date();

  const sessions = await db.session.findMany({
    where: { userId: params.userId, expires: { gt: now } },
    orderBy: { lastSeenAt: "asc" },
  });

  if (sessions.length <= MAX_SESSIONS_PER_USER) return;

  // Keep the most-recent (MAX_SESSIONS_PER_USER - 1 if newSessionId is in the list,
  // otherwise just trim down to MAX). Simplest: delete the oldest until at limit.
  const excess = sessions.length - MAX_SESSIONS_PER_USER;
  const toDelete = sessions.slice(0, excess);

  if (toDelete.length > 0) {
    await db.session.deleteMany({
      where: { id: { in: toDelete.map((s) => s.id) } },
    });
  }
}

export async function annotateSession(params: {
  sessionToken: string;
  userAgent?: string | null;
  ip?: string | null;
}) {
  await db.session.updateMany({
    where: { sessionToken: params.sessionToken },
    data: {
      userAgent: params.userAgent ?? null,
      ip: params.ip ?? null,
      lastSeenAt: new Date(),
      deviceLabel: deriveDeviceLabel(params.userAgent ?? null),
    },
  });
}

function deriveDeviceLabel(ua: string | null): string | null {
  if (!ua) return null;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Web";
}
