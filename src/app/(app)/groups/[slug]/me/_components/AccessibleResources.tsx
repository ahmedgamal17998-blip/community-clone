import { hasAccessBulk } from "@/server/access";
import Link from "next/link";
import { Hash, MessageSquare, Lock } from "lucide-react";

export async function AccessibleResources({
  groupId,
  userId,
  groupSlug,
  channels,
  chatThreads,
}: {
  groupId: string;
  userId: string;
  groupSlug: string;
  channels: { id: string; name: string; slug: string; emoji: string | null }[];
  chatThreads: { id: string; title: string | null }[];
}) {
  const channelAccess = await hasAccessBulk({
    userId,
    groupId,
    resourceType: "CHANNEL",
    resourceIds: channels.map((c) => c.id),
  });

  const chatAccess = await hasAccessBulk({
    userId,
    groupId,
    resourceType: "CHAT",
    resourceIds: chatThreads.map((t) => t.id),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Hash className="h-4 w-4" /> My channels
        </h2>
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No channels yet.</p>
        ) : (
          <ul className="space-y-1">
            {channels.map((c) => {
              const ok = channelAccess.get(c.id) ?? false;
              return (
                <li key={c.id}>
                  <Link
                    href={`/groups/${groupSlug}/channels/${c.slug}`}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted ${
                      ok ? "" : "opacity-50"
                    }`}
                  >
                    <span>
                      {c.emoji ? `${c.emoji} ` : ""}
                      {c.name}
                    </span>
                    {!ok && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" /> My group chats
        </h2>
        {chatThreads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You're not in any group chats.
          </p>
        ) : (
          <ul className="space-y-1">
            {chatThreads.map((t) => {
              const ok = chatAccess.get(t.id) ?? false;
              return (
                <li key={t.id}>
                  <Link
                    href={`/chat/${t.id}`}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted ${
                      ok ? "" : "opacity-50"
                    }`}
                  >
                    <span>{t.title ?? "Untitled"}</span>
                    {!ok && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
