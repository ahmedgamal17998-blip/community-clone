/**
 * Notifications layer (M7).
 *
 *  - createNotification   — respects user preferences, skips self-notifications
 *  - extractMentionsFromText
 *  - notifyMentions       — resolves @handles to userIds within a group
 *  - markAllReadAction / markReadAction — server actions
 *  - getUnreadCount / getRecentNotifications — read helpers
 *
 * Email delivery mirrors the auth/invite patterns: if AUTH_RESEND_KEY is set we
 * send through Resend; otherwise we console.log the payload.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Resend as ResendClient } from "resend";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getPusherServer } from "@/lib/pusher-server";

export type NotificationType =
  | "MENTION"
  | "COMMENT_ON_POST"
  | "REPLY"
  | "REACTION_ON_POST"
  | "MEMBERSHIP_APPROVED"
  | "INVITE_ACCEPTED"
  | "CHAT_MESSAGE"
  | "EVENT_CREATED"
  | "EVENT_REMINDER"
  | "BOOKING_CREATED"
  | "BOOKING_CANCELLED";

type Channel = "IN_APP" | "EMAIL" | "BOTH" | "OFF";

type PrefsRow = {
  mention: string;
  commentOnPost: string;
  replyOnComment: string;
  reactionOnPost: string;
  membershipApproved: string;
  inviteAccepted: string;
};

// Pick the right preference field for a given notification type.
function prefFor(type: NotificationType, prefs: PrefsRow): Channel {
  switch (type) {
    case "MENTION":
      return prefs.mention as Channel;
    case "COMMENT_ON_POST":
      return prefs.commentOnPost as Channel;
    case "REPLY":
      return prefs.replyOnComment as Channel;
    case "REACTION_ON_POST":
      return prefs.reactionOnPost as Channel;
    case "MEMBERSHIP_APPROVED":
      return prefs.membershipApproved as Channel;
    case "INVITE_ACCEPTED":
      return prefs.inviteAccepted as Channel;
    case "CHAT_MESSAGE":
      // No per-pref for chat yet; default to IN_APP only.
      return "IN_APP";
    case "EVENT_CREATED":
      return "IN_APP";
    case "EVENT_REMINDER":
      return "BOTH";
    case "BOOKING_CREATED":
    case "BOOKING_CANCELLED":
      return "IN_APP";
    default:
      return "IN_APP";
  }
}

const DEFAULT_PREFS: PrefsRow = {
  mention: "BOTH",
  commentOnPost: "BOTH",
  replyOnComment: "BOTH",
  reactionOnPost: "IN_APP",
  membershipApproved: "BOTH",
  inviteAccepted: "IN_APP",
};

async function getOrCreatePrefs(userId: string): Promise<PrefsRow> {
  const existing = await db.notificationPreference.findUnique({
    where: { userId },
  });
  if (existing) return existing;
  return db.notificationPreference.create({
    data: { userId, ...DEFAULT_PREFS },
  });
}

function truncate(s: string | null | undefined, max = 140): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

function subjectFor(type: NotificationType, actorName: string): string {
  switch (type) {
    case "MENTION":
      return `${actorName} mentioned you`;
    case "COMMENT_ON_POST":
      return `${actorName} commented on your post`;
    case "REPLY":
      return `${actorName} replied to your comment`;
    case "REACTION_ON_POST":
      return `${actorName} reacted to your post`;
    case "MEMBERSHIP_APPROVED":
      return `You've been approved`;
    case "INVITE_ACCEPTED":
      return `${actorName} accepted your invite`;
    case "CHAT_MESSAGE":
      return `${actorName} sent you a message`;
    case "EVENT_CREATED":
      return `${actorName} posted a new event`;
    case "EVENT_REMINDER":
      return `Event reminder`;
    case "BOOKING_CREATED":
      return `New booking with ${actorName}`;
    case "BOOKING_CANCELLED":
      return `${actorName} cancelled a booking`;
    default:
      return `New notification`;
  }
}

async function sendEmailIfConfigured(params: {
  to: string;
  type: NotificationType;
  actorName: string;
  snippet: string | null;
  href: string;
}) {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
  const fullHref = params.href.startsWith("http")
    ? params.href
    : `${baseUrl}${params.href}`;
  const subject = subjectFor(params.type, params.actorName);
  const text = `${subject}\n\n${params.snippet ?? ""}\n\nOpen: ${fullHref}`;

  if (!process.env.AUTH_RESEND_KEY) {
    // eslint-disable-next-line no-console
    console.log(
      `\n🔔  Email notif → ${params.to}\n    subject: ${subject}\n    link:    ${fullHref}\n`,
    );
    return;
  }
  try {
    const resend = new ResendClient(process.env.AUTH_RESEND_KEY);
    await resend.emails.send({
      from:
        process.env.EMAIL_FROM ?? "Community Clone <onboarding@resend.dev>",
      to: params.to,
      subject,
      text,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Resend notification email failed", e);
  }
}

export type CreateNotificationInput = {
  userId: string; // recipient
  actorId?: string | null;
  type: NotificationType;
  groupId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  membershipId?: string | null;
  inviteId?: string | null;
  snippet?: string | null;
  href: string;
};

export async function createNotification(input: CreateNotificationInput) {
  // Never notify self.
  if (input.actorId && input.actorId === input.userId) return null;

  const prefs = await getOrCreatePrefs(input.userId);
  const channel = prefFor(input.type, prefs);
  if (channel === "OFF") return null;

  const wantsInApp = channel === "IN_APP" || channel === "BOTH";
  const wantsEmail = channel === "EMAIL" || channel === "BOTH";

  let created = null;
  if (wantsInApp) {
    created = await db.notification.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        groupId: input.groupId ?? null,
        postId: input.postId ?? null,
        commentId: input.commentId ?? null,
        membershipId: input.membershipId ?? null,
        inviteId: input.inviteId ?? null,
        snippet: truncate(input.snippet ?? null),
        href: input.href,
      },
      select: { id: true },
    });

    // M15: push live notification event — silently skip if Pusher unavailable.
    const pusher = getPusherServer();
    if (pusher && created) {
      await pusher
        .trigger(`private-user-${input.userId}`, "notification.created", {
          id: created.id,
          type: input.type,
          snippet: truncate(input.snippet ?? null),
          href: input.href,
        })
        .catch(() => {
          /* ignore — non-critical */
        });
    }
  }

  if (wantsEmail) {
    const recipient = await db.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    let actorName = "Someone";
    if (input.actorId) {
      const a = await db.user.findUnique({
        where: { id: input.actorId },
        select: { name: true, handle: true },
      });
      actorName = a?.name ?? (a?.handle ? `@${a.handle}` : "Someone");
    }
    if (recipient?.email) {
      await sendEmailIfConfigured({
        to: recipient.email,
        type: input.type,
        actorName,
        snippet: truncate(input.snippet ?? null),
        href: input.href,
      });
    }
  }

  return created;
}

// ─── Mentions parsing ──────────────────────────────────────────────────────

const MENTION_RE = /(^|[^A-Za-z0-9_])@([a-zA-Z0-9][a-zA-Z0-9_-]{1,63})/g;

export async function extractMentionsFromText(text: string): Promise<string[]> {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const handle = m[2].toLowerCase();
    if (!seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
    }
  }
  return out;
}

export async function notifyMentions(params: {
  text: string;
  actorId: string;
  groupId: string;
  href: string;
  snippet?: string | null;
  postId?: string | null;
  commentId?: string | null;
}): Promise<number> {
  const handles = await extractMentionsFromText(params.text);
  if (handles.length === 0) return 0;

  const members = await db.groupMembership.findMany({
    where: {
      groupId: params.groupId,
      state: "ACTIVE",
      user: { handle: { in: handles, mode: "insensitive" } },
    },
    select: { userId: true },
  });

  let count = 0;
  for (const m of members) {
    if (m.userId === params.actorId) continue;
    await createNotification({
      userId: m.userId,
      actorId: params.actorId,
      type: "MENTION",
      groupId: params.groupId,
      postId: params.postId ?? null,
      commentId: params.commentId ?? null,
      snippet: params.snippet ?? params.text,
      href: params.href,
    });
    count++;
  }
  return count;
}

// ─── Server actions ────────────────────────────────────────────────────────

export async function markAllReadAction() {
  const session = await auth();
  if (!session?.user) return;
  await db.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/home");
}

const markOneSchema = z.object({ notificationId: z.string().cuid() });

export async function markReadAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;
  const parsed = markOneSchema.safeParse({
    notificationId: formData.get("notificationId"),
  });
  if (!parsed.success) return;
  await db.notification.updateMany({
    where: { id: parsed.data.notificationId, userId: session.user.id },
    data: { readAt: new Date() },
  });
}

// ─── Read helpers ──────────────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({
    where: { userId, readAt: null },
  });
}

export type NotificationRow = {
  id: string;
  type: string;
  snippet: string | null;
  href: string;
  readAt: Date | null;
  createdAt: Date;
  actor: {
    id: string;
    name: string | null;
    handle: string;
    image: string | null;
  } | null;
};

export async function getRecentNotifications(
  userId: string,
  limit = 30,
): Promise<{ unread: NotificationRow[]; read: NotificationRow[] }> {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: {
        select: { id: true, name: true, handle: true, image: true },
      },
    },
  });
  const mapped: NotificationRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    snippet: r.snippet,
    href: r.href,
    readAt: r.readAt,
    createdAt: r.createdAt,
    actor: r.actor,
  }));
  return {
    unread: mapped.filter((r) => r.readAt === null),
    read: mapped.filter((r) => r.readAt !== null),
  };
}

// ─── Preferences action ────────────────────────────────────────────────────

const CHANNEL_VALUES = ["IN_APP", "EMAIL", "BOTH", "OFF"] as const;
const prefsSchema = z.object({
  mention: z.enum(CHANNEL_VALUES),
  commentOnPost: z.enum(CHANNEL_VALUES),
  replyOnComment: z.enum(CHANNEL_VALUES),
  reactionOnPost: z.enum(CHANNEL_VALUES),
  membershipApproved: z.enum(CHANNEL_VALUES),
  inviteAccepted: z.enum(CHANNEL_VALUES),
});

export async function updateNotificationPrefsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const raw = {
    mention: formData.get("mention"),
    commentOnPost: formData.get("commentOnPost"),
    replyOnComment: formData.get("replyOnComment"),
    reactionOnPost: formData.get("reactionOnPost"),
    membershipApproved: formData.get("membershipApproved"),
    inviteAccepted: formData.get("inviteAccepted"),
  };
  const parsed = prefsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...parsed.data },
    update: parsed.data,
  });
  revalidatePath("/settings/notifications");
  return { ok: true as const };
}
