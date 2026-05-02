"use server";

/**
 * Email + password authentication.
 *
 * NextAuth v5's built-in Credentials provider only works with JWT sessions,
 * but this app uses database sessions (M20 device-limit & login history
 * depend on the Session table). So we run a parallel password flow that
 * mints Session rows directly — same shape PrismaAdapter creates on OAuth.
 *
 * Flow:
 *   - register: hash password (bcryptjs, 12 rounds), create User + Session,
 *               set the same cookie name NextAuth reads.
 *   - signIn:   verify password, mint a Session, set the cookie.
 *
 * Magic link + Google OAuth still work as before via NextAuth providers —
 * this is layered on top, not a replacement.
 */
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { generateHandle } from "@/lib/handle";
import { enforceSessionLimit } from "@/server/session-limit";

const SESSION_TTL_DAYS = 30;
// NextAuth v5 cookie name. The `__Secure-` prefix is added on HTTPS.
const COOKIE_NAME = "authjs.session-token";
const SECURE_COOKIE_NAME = "__Secure-authjs.session-token";

function pickCookieName() {
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? SECURE_COOKIE_NAME : COOKIE_NAME;
}

async function captureRequestMeta() {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    userAgent = h.get("user-agent") ?? null;
  } catch {
    /* request scope not available */
  }
  return { ip, userAgent };
}

async function createSessionRow(userId: string) {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  const meta = await captureRequestMeta();

  await db.session.create({
    data: {
      sessionToken,
      userId,
      expires,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  // Enforce 2-device limit + record login history (matches NextAuth signIn event).
  try {
    await enforceSessionLimit({ userId });
    await db.loginHistory.create({
      data: { userId, ip: meta.ip, userAgent: meta.userAgent },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("password-auth post-login bookkeeping failed", e);
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: pickCookieName(),
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(200),
});

export async function registerWithPasswordAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: "INVALID_INPUT" };
  }

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });
  if (existing) {
    // Another auth method already owns this email. We don't want to silently
    // attach a password to an OAuth/magic-link account from the register form
    // — surface a clear error so the user signs in via the existing method.
    return { ok: false as const, error: "EMAIL_TAKEN" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const handle = generateHandle(parsed.data.name);

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      handle,
      emailVerified: new Date(), // password registration counts as verification
      presence: { create: { status: "OFFLINE" } },
    },
    select: { id: true },
  });

  await createSessionRow(user.id);

  const callbackUrl = String(formData.get("callbackUrl") ?? "/home");
  redirect(callbackUrl);
}

const signInSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

export async function signInWithPasswordAction(formData: FormData) {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: "INVALID_INPUT" };
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });
  if (!user || !user.passwordHash) {
    return { ok: false as const, error: "INVALID_CREDENTIALS" };
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return { ok: false as const, error: "INVALID_CREDENTIALS" };

  await createSessionRow(user.id);

  const callbackUrl = String(formData.get("callbackUrl") ?? "/home");
  redirect(callbackUrl);
}

const setPasswordSchema = z.object({
  current: z.string().optional(),
  next: z.string().min(8).max(200),
});

/**
 * Lets a signed-in user (e.g. one created via magic-link or Google) set or
 * change their password from settings. If a password is already set, the
 * caller must supply the current one.
 *
 * SECURITY: userId is sourced from the authenticated session — never trust
 * a userId passed from the client.
 */
export async function setPasswordAction(input: {
  current?: string;
  next: string;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "UNAUTHENTICATED" };
  }
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "INVALID_INPUT" };
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) return { ok: false as const, error: "NOT_FOUND" };

  if (user.passwordHash) {
    if (!parsed.data.current) {
      return { ok: false as const, error: "CURRENT_REQUIRED" };
    }
    const ok = await bcrypt.compare(parsed.data.current, user.passwordHash);
    if (!ok) return { ok: false as const, error: "INVALID_CURRENT" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.next, 12);
  await db.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  });
  return { ok: true as const };
}
