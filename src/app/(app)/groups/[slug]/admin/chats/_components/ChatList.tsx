"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { bulkAddFromChannelAction } from "@/server/actions/bulk-chat";
import { Users } from "lucide-react";

type Thread = {
  id: string;
  title: string | null;
  _count: { participants: number; messages: number };
};

export function ChatList({
  groupId,
  threads,
  channels,
}: {
  groupId: string;
  threads: Thread[];
  channels: { id: string; slug: string; kind: string }[];
}) {
  if (threads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No group chats yet.</p>
    );
  }
  return (
    <div className="space-y-2">
      {threads.map((t) => (
        <Row key={t.id} groupId={groupId} thread={t} channels={channels} />
      ))}
    </div>
  );
}

function Row({
  groupId,
  thread,
  channels,
}: {
  groupId: string;
  thread: Thread;
  channels: { id: string; slug: string; kind: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [channelId, setChannelId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const bulk = () => {
    if (!channelId) return;
    startTransition(async () => {
      const r = await bulkAddFromChannelAction({
        groupId,
        threadId: thread.id,
        channelId,
      });
      setMsg(`Added ${r.added} members`);
    });
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href={`/chat/${thread.id}`} className="font-medium hover:underline">
            {thread.title ?? "Untitled chat"}
          </Link>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {thread._count.participants}
            </span>
            <span>{thread._count.messages} messages</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="">Bulk-add channel…</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.slug}
              </option>
            ))}
          </select>
          <button
            onClick={bulk}
            disabled={pending || !channelId}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "…" : "Add"}
          </button>
          {msg && <span className="text-xs text-green-600">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
