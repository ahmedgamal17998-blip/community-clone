import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { EditGroupForm } from "@/components/group/EditGroupForm";

export default async function GroupSettingsPage({ params }: { params: { slug: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
  });
  if (!group) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    notFound();
  }

  const t = await getTranslations("groups.settingsPage");

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <EditGroupForm
        group={{
          id: group.id,
          name: group.name,
          description: group.description,
          visibility: group.visibility,
          primaryHsl: group.primaryHsl,
        }}
      />
    </section>
  );
}
