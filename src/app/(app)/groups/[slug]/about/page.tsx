import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";

export default async function GroupAboutPage({ params }: { params: { slug: string } }) {
  const t = await getTranslations("groups");
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    include: { community: true },
  });
  if (!group) notFound();

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">{t("about.aboutThisGroup")}</h2>
        <p className="mt-2 text-sm text-muted-foreground dir-auto">
          {group.description ?? t("about.noDescription")}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">{t("about.partOfCommunity")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{group.community.name}</p>
        {group.community.description ? (
          <p className="mt-1 text-xs text-muted-foreground dir-auto">{group.community.description}</p>
        ) : null}
      </div>
    </section>
  );
}
