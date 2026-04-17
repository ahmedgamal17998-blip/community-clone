import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { CreateGroupForm } from "@/components/group/CreateGroupForm";

export default async function NewGroupPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("groups.wizard");

  return (
    <section className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <CreateGroupForm />
    </section>
  );
}
