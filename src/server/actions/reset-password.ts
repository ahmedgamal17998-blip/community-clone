"use server";

/**
 * Password-reset flow (unauthenticated users).
 *
 * Reuses the existing VerificationToken table — no schema migration needed.
 * identifier = "password-reset:<email>" distinguishes reset tokens from
 * magic-link tokens that NextAuth stores with identifier = "<email>".
 *
 * Flow:
 *   1. requestPasswordResetAction(email)
 *      → deletes any old token, creates new one (1-hour TTL), sends email
 *   2. resetPasswordAction(token, newPassword)
 *      → validates token, hashes new password, updates User, deletes token
 */

import { z } from "zod";
import { Resend } from "resend";
import { hash } from "bcryptjs";
import { db } from "@/server/db";

const PREFIX = "password-reset:";
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function resetIdentifier(email: string) {
  return `${PREFIX}${email.toLowerCase()}`;
}

// ─── Step 1: request reset ────────────────────────────────────────────────────

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<{ ok: true } | { error: "INVALID_EMAIL" }> {
  const parsed = z.string().email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "INVALID_EMAIL" };

  const email = parsed.data.toLowerCase();
  const identifier = resetIdentifier(email);

  // Don't reveal whether the email exists — always return ok
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return { ok: true };

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + EXPIRY_MS);

  // Delete any existing reset token for this email, then create a fresh one
  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({ data: { identifier, token, expires } });

  // AUTH_URL is set by NextAuth v5 / the VPS .env ("https://nadi.salezprint.com").
  // Fall back through other common names so local dev still works.
  const rawBase =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:3000";
  // Strip surrounding quotes that some .env editors add, e.g. AUTH_URL="https://..."
  const base = rawBase.replace(/^["']|["']$/g, "").replace(/\/$/, "");
  const resetUrl = `${base}/reset-password?token=${token}`;

  const resendKey =
    process.env.AUTH_RESEND_KEY ??
    process.env.RESEND_API_KEY ??
    "";

  if (!resendKey) {
    // Dev fallback — print link to console (no email sent)
    // eslint-disable-next-line no-console
    console.log(
      `\n🔑  Password reset link for ${email}\n    ${resetUrl}\n    (AUTH_RESEND_KEY unset — no email sent)\n`,
    );
    return { ok: true };
  }

  const resend = new Resend(resendKey);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Nadi <onboarding@resend.dev>",
    to: email,
    subject: "Reset your Nadi password",
    html: resetPasswordEmail({ url: resetUrl, email }),
    text: `Reset your Nadi password: ${resetUrl}`,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[reset-password] Resend error for ${email}: ${error.message}`);
    // Still return ok — don't reveal email/domain issues to the user
    return { ok: true };
  }

  return { ok: true };
}

// ─── Step 2: apply new password ──────────────────────────────────────────────

export async function resetPasswordAction(formData: FormData): Promise<
  | { ok: true }
  | { error: "INVALID_INPUT" | "INVALID_TOKEN" | "EXPIRED" | "NOT_FOUND" }
> {
  const tokenParsed = z.string().uuid().safeParse(formData.get("token"));
  const passwordParsed = z.string().min(8).safeParse(formData.get("password"));

  if (!tokenParsed.success || !passwordParsed.success) {
    return { error: "INVALID_INPUT" };
  }

  const record = await db.verificationToken.findUnique({
    where: { token: tokenParsed.data },
  });

  if (!record || !record.identifier.startsWith(PREFIX)) {
    return { error: "INVALID_TOKEN" };
  }

  if (record.expires < new Date()) {
    await db.verificationToken.delete({ where: { token: tokenParsed.data } });
    return { error: "EXPIRED" };
  }

  const email = record.identifier.slice(PREFIX.length);
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { error: "NOT_FOUND" };

  const passwordHash = await hash(passwordParsed.data, 12);

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.verificationToken.delete({ where: { token: tokenParsed.data } }),
  ]);

  return { ok: true };
}

// ─── Email template ──────────────────────────────────────────────────────────

function resetPasswordEmail({ url, email }: { url: string; email: string }) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 40px auto; color: #1f1f2a;">
    <h2 style="margin: 0 0 16px;">Reset your password</h2>
    <p>We received a request to reset the password for <strong>${email}</strong>.</p>
    <p>Click the button below to choose a new password. The link expires in <strong>1 hour</strong>.</p>
    <p style="margin: 24px 0;">
      <a href="${url}" style="display: inline-block; background: #6d3691; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Reset password
      </a>
    </p>
    <p style="color: #6b6b78; font-size: 13px;">If you didn't request this, you can safely ignore the email.</p>
  </body>
</html>`;
}
