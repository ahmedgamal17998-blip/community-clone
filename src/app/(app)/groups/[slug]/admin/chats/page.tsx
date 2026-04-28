import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { CreateGroupChatForm } from "./_components/CreateGroupChatForm";
import { ChatList } from "./_components/ChatList";

export default async function AdminChatsPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      channels: { select: { id: true, name: true, slug: true, kind: true } },
      memberships: {
        where: { state: "ACTIVE" },
        select: { userId: true, user: { select: { name: true, handle: true } } },
        take: 100,
      },
    },
  });
  if (!group) notFound();

  const allowed = await hasCapability({
    userId: session.user.id,
    groupId: group.id,
    capability: "CHATS_MANAGE",
  });
  if (!allowed) notFound();

  const threads = await db.chatThread.findMany({
    where: { groupId: group.id, kind: "GROUP" },
    include: {
      _count: { select: { participants: true, messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Group chats</h1>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Create new group chat</h2>
        <CreateGroupChatForm
          groupId={group.id}
          channels={group.channels}
          members={group.memberships.map((m) => ({
            id: m.userId,
            name: m.user.name,
            handle: m.user.handle,
          }))}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Existing group chats</h2>
        <ChatList groupId={group.id} threads={threads} channels={group.channels} />
      </section>
    </div>
  );
}
