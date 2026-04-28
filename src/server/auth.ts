/**
 * NextAuth.js v5 (beta) configuration.
 *
 * Providers:
 *   - Email magic link via Resend. If AUTH_RESEND_KEY is unset, the magic-link
 *     URL is logged to the server console (dev convenience — no real emails).
 *   - Google OAuth (enabled only when AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set).
 *
 * On first sign-in we ensure a handle + Presence row exist.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { Resend as ResendClient } from "resend";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { generateHandle } from "@/lib/handle";
import { enforceSessionLimit } from "@/server/session-limit";

const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const hasResend = Boolean(process.env.AUTH_RESEND_KEY);

const providers: NextAuthConfig["providers"] = [];

if (hasGoogle) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  );
}

providers.push(
  Resend({
    apiKey: process.env.AUTH_RESEND_KEY ?? "dev-noop",
    from: process.env.EMAIL_FROM ?? "Community Clone <onboarding@resend.dev>",
    async sendVerificationRequest({ identifier: email, url, provider }) {
      if (!hasResend) {
        // Dev path: print the magic link to the server console so you can copy it.
        // (NextAuth still stores the VerificationToken, so the link will work.)
        // eslint-disable-next-line no-console
        console.log(
          `\n🔑  Magic link for ${email}\n    ${url}\n    (AUTH_RESEND_KEY unset — no email sent)\n`,
        );
        return;
      }
      const resend = new ResendClient(provider.apiKey as string);
      const { error } = await resend.emails.send({
        from: provider.from as string,
        to: email,
        subject: "Sign in to Community Clone",
        html: magicLinkEmail({ url, email }),
        text: `Sign in to Community Clone: ${url}`,
      });
      if (error) throw new Error(`Resend error: ${error.message}`);
    },
  }),
);

function magicLinkEmail({ url, email }: { url: string; email: string }) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 40px auto; color: #1f1f2a;">
    <h2 style="margin: 0 0 16px;">Sign in to Community Clone</h2>
    <p>Click the button below to sign in as <strong>${email}</strong>. The link is valid for 24 hours.</p>
    <p style="margin: 24px 0;">
      <a href="${url}" style="display: inline-block; background: #6d3691; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Sign in</a>
    </p>
    <p style="color: #6b6b78; font-size: 13px;">If you didn't request this, you can safely ignore the email.</p>
  </body>
</html>`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify",
  },
  providers,
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string; handle: string }).id = user.id;
        // Hydrate handle from DB so client components can link to /profile/:handle.
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { handle: true, locale: true },
        });
        if (dbUser) {
          (session.user as typeof session.user & { handle: string }).handle = dbUser.handle;
          (session.user as typeof session.user & { locale: string }).locale = dbUser.locale;
        }
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Ensure every new user has a handle + Presence row.
      if (!user.id) return;
      const handle = generateHandle(user.name ?? user.email?.split("@")[0] ?? null);
      await db.user.update({
        where: { id: user.id },
        data: {
          handle,
          presence: { create: { status: "OFFLINE" } },
        },
      });
    },
    // M20: enforce 2-device session limit + record login history (with IP / UA).
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        await enforceSessionLimit({ userId: user.id });

        // Best-effort header capture (events run inside the sign-in request).
        let ip: string | null = null;
        let userAgent: string | null = null;
        try {
          const h = await headers();
          ip =
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            h.get("x-real-ip") ??
            null;
          userAgent = h.get("user-agent") ?? null;
        } catch {
          /* headers() unavailable outside request — ignore */
        }

        await db.loginHistory.create({
          data: { userId: user.id, ip, userAgent },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("signIn event error:", e);
      }
    },
    // Close the most recent open login record with elapsed duration.
    async signOut(message) {
      try {
        // With database sessions, message is { session: { userId, ... } }.
        const userId =
          "session" in message && message.session
            ? (message.session as { userId?: string }).userId ?? null
            : null;
        if (!userId) return;

        const last = await db.loginHistory.findFirst({
          where: { userId, durationSec: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true },
        });
        if (!last) return;

        const closedAt = new Date();
        const durationSec = Math.max(
          0,
          Math.floor((closedAt.getTime() - last.createdAt.getTime()) / 1000),
        );
        await db.loginHistory.update({
          where: { id: last.id },
          data: { closedAt, durationSec },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("signOut event error:", e);
      }
    },
  },
});
