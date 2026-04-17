import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { CreateChannelForm } from "@/components/channel/CreateChannelForm";

export default async function NewChannelPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    notFound();
  }

  const t = await getTranslations("channels.new");

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <CreateChannelForm groupId={group.id} />
    </div>
  );
}
