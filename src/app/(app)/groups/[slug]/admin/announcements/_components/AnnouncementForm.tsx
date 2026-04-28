"use client";

import { useState, useTransition } from "react";
import { createAnnouncementAction } from "@/server/actions/announcement";

export function AnnouncementForm({ groupId }: { groupId: string }) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [durationSec, setDurationSec] = useState(8);
  const [endsAt, setEndsAt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () => {
    if (!title || !body) return;
    setMsg(null);
    startTransition(async () => {
      await createAnnouncementAction({
        groupId,
        title,
        body,
        ctaUrl: ctaUrl || undefined,
        durationSec,
        endsAt: endsAt ? new Date(endsAt) : null,
      });
      setMsg("Announcement created — members will see it on next session.");
      setTitle("");
      setBody("");
      setCtaUrl("");
    });
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <textarea
        placeholder="Body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <div className="grid gap-3 md:grid-cols-3">
        <input
          type="url"
          placeholder="CTA URL (optional)"
          value={ctaUrl}
          onChange={(e) => setCtaUrl(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm md:col-span-2"
        />
        <input
          type="number"
          min={3}
          max={60}
          value={durationSec}
          onChange={(e) => setDurationSec(Number(e.target.value))}
          placeholder="Auto-close (sec)"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Stop showing after (optional)
        </label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !title || !body}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Send announcement"}
        </button>
        {msg && <span className="text-xs text-green-600">{msg}</span>}
      </div>
    </div>
  );
}
