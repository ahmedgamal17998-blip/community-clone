import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { LandingPageSelector } from "./_components/LandingPageSelector";
import { LoginPopupForm } from "./_components/LoginPopupForm";

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
    },
  });
  if (!group || !session?.user) notFound();

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
            }}
          />
        </div>
      </div>
    </section>
  );
}
