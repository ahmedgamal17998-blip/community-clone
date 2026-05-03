import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
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
      tier: true,
      visibility: true,
      chatEnabled: true,
      archived: true,
      position: true,
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Channels</h1>
          <p className="text-sm text-muted-foreground">
            Drag to reorder. Set kind (Public / Private / Announcement) and —
            for private channels — pick whether non-members see the channel
            dimmed or hidden completely. Access is granted by including the
            channel in a plan or by per-member grants.
          </p>
        </div>
        <Link
          href={`/groups/${group.slug}/channels/new`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New channel
        </Link>
      </div>
      <ChannelSortableList groupId={group.id} channels={channels} />
    </section>
  );
}
