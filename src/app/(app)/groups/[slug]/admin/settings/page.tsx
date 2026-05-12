import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { LandingPageSelector } from "./_components/LandingPageSelector";
import { LoginPopupForm } from "./_components/LoginPopupForm";
import { FreeTrialForm } from "./_components/FreeTrialForm";
import { LeavePopupForm } from "./_components/LeavePopupForm";
import { PaymentIntegrationCard } from "./_components/PaymentIntegrationCard";
import { RetentionForm } from "./_components/RetentionForm";
import { headers } from "next/headers";

export default async function AdminSettingsPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      visibility: true,
      active: true,
      defaultLandingPath: true,
      loginPopupEnabled: true,
      loginPopupTitle: true,
      loginPopupBody: true,
      loginPopupCtaUrl: true,
      loginPopupDurationSec: true,
      loginPopupReshowHours: true,
      freeTrialDays: true,
      leavePopupEnabled: true,
      leavePopupBody: true,
      leavePopupFontFamily: true,
      leavePopupFontSizePx: true,
      leavePopupColor: true,
      leavePopupBold: true,
      leavePopupStayLabel: true,
      leavePopupLeaveLabel: true,
      retentionDays: true,
    },
  });
  if (!group || !session?.user) notFound();

  // Payment-integration health: gather env state + recent webhook count.
  const recentSince = new Date(Date.now() - 30 * 86400_000);
  const [recentEventCount, lastEvent] = await Promise.all([
    db.paymentWebhookEvent.count({ where: { receivedAt: { gt: recentSince } } }),
    db.paymentWebhookEvent.findFirst({
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
  ]);
  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const paymentHealth = {
    paymentSystemUrl: process.env.PAYMENT_SYSTEM_URL?.replace(/\/$/, "") ?? null,
    hasAdminKey: !!process.env.PAYMENT_SYSTEM_ADMIN_KEY,
    hasWebhookSecret: !!process.env.PAYMENT_WEBHOOK_SECRET,
    webhookEndpoint: host ? `${proto}://${host}/api/webhooks/payment` : "/api/webhooks/payment",
    recentEventCount,
    lastEventAt: lastEvent?.receivedAt?.toISOString() ?? null,
  };

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true },
  });
  const isOwner = me?.role === "OWNER";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Name, slug, description, visibility, and danger zone.
        </p>
      </div>
      <SettingsForm
        groupId={group.id}
        isOwner={isOwner}
        initial={{
          name: group.name,
          slug: group.slug,
          description: group.description,
          visibility: group.visibility,
          active: group.active,
        }}
      />

      {/* Default landing page — themed card */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold text-foreground">
            Default landing page
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Where members land after sign-in.
          </p>
          <LandingPageSelector
            groupId={group.id}
            groupSlug={group.slug}
            initial={group.defaultLandingPath ?? ""}
          />
        </div>
      </div>

      {/* Free trial — monetization */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold text-foreground">Free trial</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Give every brand-new member free access to all premium content for
            this many days. After the trial ends, premium content is locked
            until they subscribe to a plan. Set 0 to disable.
          </p>
          <FreeTrialForm
            groupId={group.id}
            initial={group.freeTrialDays ?? 0}
          />
        </div>
      </div>

      {/* Data retention — auto-cleanup */}
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--destructive)) 0%, hsl(var(--destructive) / 0.5) 100%)",
          }}
        />
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold text-foreground">
            Data retention
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Automatically delete old posts, comments, and channel chat messages
            after a set number of days. Pinned posts are never deleted.
            Direct messages are always cleaned up after 180 days globally.
            Default: <strong>disabled</strong> (keep everything forever).
          </p>
          <RetentionForm
            groupId={group.id}
            initial={group.retentionDays ?? null}
          />
        </div>
      </div>

      {/* Payment integration — connection status to Subscription-base */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold text-foreground">
            Payment integration
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Connection status to the external Subscription-base payment
            system. Configure environment variables, register the webhook
            URL on the payment side, then test the connection.
          </p>
          <PaymentIntegrationCard initial={paymentHealth} />
        </div>
      </div>

      {/* Leave-attempt popup — retention dialog when a member taps Leave */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold text-foreground">
            Leave-attempt popup
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Retention dialog shown when a member taps Leave. Customize the
            message, font, color, and button labels. Use <code>**word**</code>{" "}
            to bold a phrase.
          </p>
          <LeavePopupForm
            groupId={group.id}
            initial={{
              enabled: group.leavePopupEnabled,
              body: group.leavePopupBody ?? "",
              fontFamily: group.leavePopupFontFamily ?? "",
              fontSizePx: group.leavePopupFontSizePx ?? 16,
              color: group.leavePopupColor ?? "",
              bold: group.leavePopupBold,
              stayLabel: group.leavePopupStayLabel ?? "",
              leaveLabel: group.leavePopupLeaveLabel ?? "",
            }}
          />
        </div>
      </div>

      {/* Login popup — themed card matching the actual popup it configures */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold text-foreground">Login popup</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Greet members with a short message every time they sign in.
          </p>
          <LoginPopupForm
            groupId={group.id}
            initial={{
              enabled: group.loginPopupEnabled,
              title: group.loginPopupTitle ?? "",
              body: group.loginPopupBody ?? "",
              ctaUrl: group.loginPopupCtaUrl ?? "",
              durationSec: group.loginPopupDurationSec ?? 8,
              reshowHours: group.loginPopupReshowHours ?? 4,
            }}
          />
        </div>
      </div>
    </section>
  );
}
