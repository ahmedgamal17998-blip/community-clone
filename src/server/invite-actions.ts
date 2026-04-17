/**
 * Invite server actions (M6).
 *
 * createInviteAction  — ADMIN+ of a group creates an invite token (+ optional email).
 * revokeInviteAction  — ADMIN+ revokes a pending invite.
 * acceptInviteAction  — authed user redeems an invite token → ACTIVE membership.
 *
 * Email delivery mirrors the NextAuth/Resend pattern in src/server/auth.ts:
 * when AUTH_RESEND_KEY is unset we log the link to the server console instead
 * of sending an email, so the action still succeeds in dev.
 */
"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Resend as ResendClient } from "resend";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { requireRole } from "@/server/permissions";
import { syncAllChannelsForGroup } from "@/server/channels";
import { createNotification } from "@/server/notifications";

const INVITE_ROLES = ["MEMBER", "CONTRIBUTOR", "ADMIN"] as const;

const createSchema = z.object({
  groupId: z.string().cuid(),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  role: z.enum(INVITE_ROLES).default("MEMBER"),
});

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000"
  );
}

function inviteEmail({ url, groupName }: { url: string; groupName: string }) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 40px auto; color: #1f1f2a;">
    <h2 style="margin: 0 0 16px;">You're invited to ${groupName}</h2>
    <p>Click the button below to accept the invitation. The link is valid for 14 days.</p>
    <p style="margin: 24px 0;">
      <a href="${url}" style="display: inline-block; background: #6d3691; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept invite</a>
    </p>
    <p style="color: #6b6b78; font-size: 13px;">If you didn't expect this, you can safely ignore the email.</p>
  </body>
</html>`;
}

export async function createInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const raw = {
    groupId: formData.get("groupId"),
    email: (formData.get("email") as string | null) || undefined,
    role: (formData.get("role") as string | null) || "MEMBER",
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await requireRole({
    groupId: parsed.data.groupId,
    userId: session.user.id,
    min: "ADMIN",
  });

  const group = await db.group.findUnique({
    where: { id: parsed.data.groupId },
    select: { id: true, slug: true, name: true },
  });
  if (!group) throw new Error("NOT_FOUND");

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const invite = await db.invite.create({
    data: {
      token,
      groupId: group.id,
      invitedById: session.user.id,
      email: parsed.data.email ?? null,
      role: parsed.data.role,
      expiresAt,
    },
  });

  const link = `${baseUrl()}/invite/${token}`;

  if (parsed.data.email && process.env.AUTH_RESEND_KEY) {
    try {
      const resend = new ResendClient(process.env.AUTH_RESEND_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Community Clone <onboarding@resend.dev>",
        to: parsed.data.email,
        subject: `You're invited to ${group.name}`,
        html: inviteEmail({ url: link, groupName: group.name }),
        text: `You're invited to ${group.name}: ${link}`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Resend invite email failed", e);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `\n🎟️  Invite link for ${parsed.data.email ?? "(no email)"} to ${group.name}\n    ${link}\n`,
    );
  }

  revalidatePath(`/groups/${group.slug}/members/invite`);
  return { ok: true as const, inviteId: invite.id, link };
}

const revokeSchema = z.object({ inviteId: z.string().cuid() });

export async function revokeInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = revokeSchema.safeParse({ inviteId: formData.get("inviteId") });
  if (!parsed.success) return;

  const invite = await db.invite.findUnique({
    where: { id: parsed.data.inviteId },
    include: { group: { select: { slug: true } } },
  });
  if (!invite) return;

  await requireRole({ groupId: invite.groupId, userId: session.user.id, min: "ADMIN" });

  await db.invite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
  });

  revalidatePath(`/groups/${invite.group.slug}/members/invite`);
}

const acceptSchema = z.object({ token: z.string().min(10) });

export async function acceptInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = acceptSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) throw new Error("INVALID_TOKEN");

  const invite = await db.invite.findUnique({
    where: { token: parsed.data.token },
    include: { group: { select: { slug: true, id: true } } },
  });
  if (!invite) throw new Error("NOT_FOUND");
  if (invite.revokedAt) throw new Error("REVOKED");
  if (invite.acceptedAt) throw new Error("ALREADY_ACCEPTED");
  if (invite.expiresAt.getTime() < Date.now()) throw new Error("EXPIRED");

  await db.$transaction(async (tx) => {
    await tx.groupMembership.upsert({
      where: { groupId_userId: { groupId: invite.groupId, userId: session.user!.id } },
      update: { state: "ACTIVE", role: invite.role },
      create: {
        groupId: invite.groupId,
        userId: session.user!.id,
        state: "ACTIVE",
        role: invite.role,
      },
    });
    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedById: session.user!.id },
    });
  });

  await syncAllChannelsForGroup(db, invite.groupId);

  // Notify the inviter that their invite was accepted.
  try {
    if (invite.invitedById !== session.user.id) {
      await createNotification({
        userId: invite.invitedById,
        actorId: session.user.id,
        type: "INVITE_ACCEPTED",
        groupId: invite.groupId,
        inviteId: invite.id,
        snippet: `Your invite was accepted`,
        href: `/groups/${invite.group.slug}/members`,
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("INVITE_ACCEPTED notification failed", e);
  }

  revalidatePath(`/groups/${invite.group.slug}`);
  revalidatePath(`/groups/${invite.group.slug}/members`);
  redirect(`/groups/${invite.group.slug}`);
}
