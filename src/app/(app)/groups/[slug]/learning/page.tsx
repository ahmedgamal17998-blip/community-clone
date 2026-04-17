import { getTranslations } from "next-intl/server";

export default async function GroupLearningPage() {
  const t = await getTranslations("groups");
  return (
    <section className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
      <h2 className="text-base font-semibold">{t("empty.learningTitle")}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("empty.learningBody")}</p>
    </section>
  );
}
