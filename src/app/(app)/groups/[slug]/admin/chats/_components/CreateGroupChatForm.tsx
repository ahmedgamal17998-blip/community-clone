"use client";

import { useState, useTransition } from "react";
import {
  createGroupChatAction,
  bulkAddFromChannelAction,
} from "@/server/actions/bulk-chat";

export function CreateGroupChatForm({
  groupId,
  channels,
  members,
}: {
  groupId: string;
  channels: { id: string; name: string; slug: string; kind: string }[];
  members: { id: string; name: string | null; handle: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [bulkChannelId, setBulkChannelId] = useState("");
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () => {
    if (!title) return;
    startTransition(async () => {
      const thread = await createGroupChatAction({
        groupId,
        title,
        participantIds: Array.from(participants),
      });
      // Bulk-add channel members in second step (idempotent)
      if (bulkChannelId) {
        const r = await bulkAddFromChannelAction({
          groupId,
          threadId: thread.id,
          channelId: bulkChannelId,
        });
        setMsg(`Created with ${r.added} members from channel.`);
      } else {
        setMsg("Group chat created.");
      }
      setTitle("");
      setParticipants(new Set());
      setBulkChannelId("");
    });
  };

  const toggle = (id: string) =>
    setParticipants((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Chat title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Bulk-add all members of channel (optional)
        </label>
        <select
          value={bulkChannelId}
          onChange={(e) => setBulkChannelId(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">— None —</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.slug} ({c.kind})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Or pick individuals
        </label>
        <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded p-1 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={participants.has(m.id)}
                onChange={() => toggle(m.id)}
              />
              {m.name ?? m.handle} <span className="text-xs text-muted-foreground">@{m.handle}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !title}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create group chat"}
        </button>
        {msg && <span className="text-xs text-green-600">{msg}</span>}
      </div>
    </div>
  );
}
