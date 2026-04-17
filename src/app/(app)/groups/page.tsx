import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { listMyGroups, listDiscoverableGroups } from "@/server/group-queries";
import { GroupAvatar } from "@/components/group/GroupAvatar";
import { Button } from "@/components/ui/button";

export default async function GroupsDirectoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("groups");

  const [mine, discover] = await Promise.all([
    listMyGroups(session.user.id),
    listDiscoverableGroups(session.user.id),
  ]);

  return (
    <div className="space-y-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("directory.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("directory.subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/groups/new" className="gap-2">
            <Plus className="h-4 w-4" />
            {t("create")}
          </Link>
        </Button>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("directory.yours")}
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("directory.noneYet")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.slug}`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40"
              >
                <GroupAvatar name={g.name} logoUrl={g.logoUrl} primaryHsl={g.primaryHsl} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium group-hover:text-primary">{g.name}</div>
                  <div className="text-xs uppercase text-muted-foreground">
                    {g.state === "REQUESTED" ? t("pending") : g.role}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("directory.discover")}
        </h2>
        {discover.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("directory.nothingToDiscover")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {discover.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.slug}`}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40"
              >
                <GroupAvatar name={g.name} logoUrl={g.logoUrl} primaryHsl={g.primaryHsl} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{g.name}</div>
                  {g.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground dir-auto">
                      {g.description}
                    </p>
                  ) : null}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {t(`visibility.${g.visibility.toLowerCase()}`)} ·{" "}
                    {t("memberCount", { count: g._count.memberships })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
