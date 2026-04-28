import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { BulkMemberActions } from "@/components/admin/BulkMemberActions";

export default async function AdminMembersPage({
  params,
}: {
  params: { slug: string };
}) {
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const memberships = await db.groupMembership.findMany({
    where: { groupId: group.id },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      id: true,
      role: true,
      state: true,
      userId: true,
      user: { select: { name: true, handle: true } },
    },
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground">
          Select members to apply bulk role or moderation actions.
        </p>
      </div>
      <BulkMemberActions groupId={group.id} groupSlug={group.slug} memberships={memberships} />
    </section>
  );
}
