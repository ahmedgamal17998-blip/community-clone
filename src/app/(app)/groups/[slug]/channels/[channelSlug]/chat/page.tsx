import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { getThread } from "@/server/chat";
import {
  ChatThreadView,
  type ChatMessageView,
} from "@/components/chat/ChatThreadView";

export const dynamic = "force-dynamic";

function serializeMessage(m: any): ChatMessageView {
  return {
    id: m.id,
    threadId: m.threadId,
    authorId: m.authorId,
    body: m.body,
    mediaUrl: m.mediaUrl,
    mediaType: m.mediaType,
    pinned: m.pinned,
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    author: {
      id: m.author.id,
      name: m.author.name,
      handle: m.author.handle,
      image: m.author.image,
    },
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          body: m.replyTo.body,
          author: m.replyTo.author
            ? {
                name: m.replyTo.author.name,
                handle: m.replyTo.author.handle,
              }
            : null,
        }
      : null,
  };
}

export default async function ChannelChatPage({
  params,
}: {
  params: { slug: string; channelSlug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const channel = await db.channel.findFirst({
    where: { slug: params.channelSlug, group: { slug: params.slug } },
    select: {
      id: true,
      groupId: true,
      chatThread: { select: { id: true } },
    },
  });
  if (!channel || !channel.chatThread) notFound();

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: channel.groupId, userId: session.user.id },
    },
    select: { role: true, state: true },
  });
  if (!membership || membership.state !== "ACTIVE") notFound();
  const isAdmin = hasMinRole(membership.role as Role, "ADMIN");

  const data = await getThread(channel.chatThread.id, session.user.id);
  if (!data) notFound();

  return (
    <ChatThreadView
      threadId={data.thread.id}
      kind="CHANNEL"
      viewerId={session.user.id}
      viewerIsAdmin={isAdmin}
      groupSlug={params.slug}
      participants={data.thread.participants.map((p) => ({
        id: p.user.id,
        name: p.user.name,
        handle: p.user.handle,
        image: p.user.image,
      }))}
      initialMessages={data.messages.map(serializeMessage)}
      pinned={data.pinned.map(serializeMessage)}
    />
  );
}
