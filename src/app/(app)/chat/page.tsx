import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, Plus } from "lucide-react";
import { auth } from "@/server/auth";
import { BackButton } from "@/components/layout/BackButton";
import { db } from "@/server/db";
import { listInboxThreads } from "@/server/chat";
import { hasCapability } from "@/server/capabilities";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function timeLabel(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString();
}

export default async function ChatInboxPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const threads = await listInboxThreads(session.user.id);

  // Group chats can only be created by admins of any group with CHATS_MANAGE.
  // Members see no "+ New group" button — they can only DM.
  const myAdminMemberships = await db.groupMembership.findMany({
    where: {
      userId: session.user.id,
      state: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { groupId: true },
  });
  let canCreateGroupChat = false;
  for (const m of myAdminMemberships) {
    const allowed = await hasCapability({
      userId: session.user.id,
      groupId: m.groupId,
      capability: "CHATS_MANAGE",
    });
    if (allowed) {
      canCreateGroupChat = true;
      break;
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BackButton />
          <h1 className="text-xl font-semibold">Chat</h1>
        </div>
        {canCreateGroupChat && (
          <Button asChild size="sm" variant="outline">
            <Link href="/chat/new" className="gap-1">
              <Plus className="h-4 w-4" />
              New group
            </Link>
          </Button>
        )}
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">No conversations yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {canCreateGroupChat
              ? "Visit a profile and hit Message, or start a new group chat."
              : "Visit a member's profile and hit Message to start a conversation."}
          </p>
          {canCreateGroupChat && (
            <Button asChild className="mt-4">
              <Link href="/chat/new">Start a conversation</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {threads.map((t) => {
            const title =
              t.kind === "DIRECT" && t.otherUser
                ? t.otherUser.name ?? `@${t.otherUser.handle}`
                : t.title ?? "Group chat";
            const preview = t.lastMessage
              ? t.lastMessage.body ??
                (t.lastMessage.mediaType
                  ? `[${t.lastMessage.mediaType}]`
                  : "")
              : "No messages yet";
            const image = t.otherUser?.image ?? null;
            return (
              <li key={t.id}>
                <Link
                  href={`/chat/${t.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                        {title.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{title}</div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {t.lastMessage
                          ? timeLabel(new Date(t.lastMessage.createdAt))
                          : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {preview}
                      </div>
                      {t.unreadCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {t.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
