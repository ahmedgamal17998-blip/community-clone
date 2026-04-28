import Link from "next/link";
import { Plus, Compass } from "lucide-react";
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

  const mine = session?.user ? await listMyGroups(session.user.id) : [];
  const me = session?.user
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { canCreateGroups: true },
      })
    : null;
  const canCreate = !!me?.canCreateGroups;

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
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/groups" className="gap-2">
                <Compass className="h-4 w-4" />
                {tg("discover")}
              </Link>
            </Button>
            {canCreate && (
              <Button asChild size="sm">
                <Link href="/groups/new" className="gap-2">
                  <Plus className="h-4 w-4" />
                  {tg("create")}
                </Link>
              </Button>
            )}
          </div>
        </div>

        {mine.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground dir-auto">
            {tg("noneYet")}
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
