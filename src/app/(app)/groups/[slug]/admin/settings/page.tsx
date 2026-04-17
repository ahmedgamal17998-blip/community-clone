import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { SettingsForm } from "@/components/admin/SettingsForm";

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
    },
  });
  if (!group || !session?.user) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true },
  });
  const isOwner = me?.role === "OWNER";

  return (
    <section className="space-y-4">
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
    </section>
  );
}
