import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/server/auth";
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

export default async function ChatThreadPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const data = await getThread(params.id, session.user.id);
  if (!data) notFound();

  const { thread, messages, pinned } = data;

  // Channel threads should render inside the channel page — bounce over.
  if (thread.kind === "CHANNEL" && thread.channel) {
    redirect(
      `/groups/${thread.channel.group.slug}/channels/${thread.channel.slug}?view=chat`,
    );
  }

  const others = thread.participants.filter((p) => p.userId !== session.user.id);
  const title =
    thread.kind === "DIRECT" && others[0]
      ? others[0].user.name ?? `@${others[0].user.handle}`
      : thread.title ?? "Group chat";

  return (
    <section className="mx-auto max-w-3xl space-y-3">
      <div className="flex items-center gap-2">
        <Link
          href="/chat"
          aria-label="Back"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {thread.participants
              .map((p) => p.user.name ?? `@${p.user.handle}`)
              .join(", ")}
          </p>
        </div>
      </div>

      <ChatThreadView
        threadId={thread.id}
        kind={thread.kind as "DIRECT" | "GROUP" | "CHANNEL"}
        viewerId={session.user.id}
        viewerIsAdmin={false}
        participants={thread.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          handle: p.user.handle,
          image: p.user.image,
        }))}
        initialMessages={messages.map(serializeMessage)}
        pinned={pinned.map(serializeMessage)}
      />
    </section>
  );
}
