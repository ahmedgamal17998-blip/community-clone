import Link from "next/link";
import { Plus, Compass, LayoutDashboard } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { listMyGroups } from "@/server/group-queries";
import { GroupAvatar } from "@/components/group/GroupAvatar";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();
  const t = await getTranslations("home");
  const tg = await getTranslations("groups");

  const [mine, hasTenantResult] = session?.user
    ? await Promise.all([
        listMyGroups(session.user.id),
        db.tenant.findFirst({ where: { ownerId: session.user.id }, select: { id: true } }),
      ])
    : [[], null];

  // Only tenant owners can create a new group.
  // Regular members never see the create button.
  const hasTenant = !!hasTenantResult;
  const isOwner = (session?.user as any)?.accountType === "OWNER" || hasTenant; // existing owners keep access
  const canCreate = hasTenant;

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("welcome", { name: session?.user?.name ?? "friend" })}
      </h1>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {tg("yourGroups")}
          </h2>
          <div className="flex gap-1.5 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
              <Link href="/groups" className="gap-1.5">
                <Compass className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{tg("discover")}</span>
              </Link>
            </Button>
            {hasTenant && (
              <Button asChild variant="outline" size="sm" className="px-2 sm:px-3">
                <Link href="/admin" className="gap-1.5">
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>
              </Button>
            )}
            {canCreate && (
              <Button asChild size="sm" className="px-2 sm:px-3">
                <Link href={hasTenant ? "/groups/new" : "/create"} className="gap-1.5">
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{tg("create")}</span>
                </Link>
              </Button>
            )}
          </div>
        </div>

        {mine.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-4">
            <p className="text-sm text-muted-foreground">{tg("noneYet")}</p>
            {/* Smart onboarding CTAs for brand-new users */}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href="/groups"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Compass className="h-4 w-4" />
                Browse communities to join
              </a>
              {isOwner && !hasTenant && (
                <a
                  href="/admin/setup"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Create your own community
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mine.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.slug}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40"
              >
                <GroupAvatar name={g.name} logoUrl={g.logoUrl} primaryHsl={g.primaryHsl} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{g.name}</div>
                  <div className="text-xs uppercase text-muted-foreground">
                    {g.state === "REQUESTED" ? tg("pending") : g.role}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
