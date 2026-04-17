import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { ChannelSortableList } from "@/components/admin/ChannelSortableList";

export default async function AdminChannelsPage({
  params,
}: {
  params: { slug: string };
}) {
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const channels = await db.channel.findMany({
    where: { groupId: group.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      emoji: true,
      kind: true,
      archived: true,
      position: true,
    },
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Channels</h1>
        <p className="text-sm text-muted-foreground">
          Drag to reorder. Change kind or archive from the row controls.
        </p>
      </div>
      <ChannelSortableList groupId={group.id} channels={channels} />
    </section>
  );
}
