"use client";

/**
 * Themed to match the LoginPopup admin form: shared inputBase, primary
 * focus ring, dark/light contrast, clean labels.
 */

import { useState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import { createAnnouncementAction } from "@/server/actions/announcement";

const inputBase =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50";

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
      setMsg("Sent — members will see it on their next page load.");
      setTitle("");
      setBody("");
      setCtaUrl("");
      setEndsAt("");
    });
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Title
        </label>
        <input
          type="text"
          placeholder="e.g. New course launches today!"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputBase}
        />
      </div>

      {/* Body */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Body
        </label>
        <textarea
          placeholder="What members should know…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className={inputBase + " resize-y"}
        />
      </div>

      {/* CTA + duration */}
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            CTA link <span className="font-normal">(optional)</span>
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            className={inputBase}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Auto-close (sec)
          </label>
          <input
            type="number"
            min={3}
            max={60}
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value))}
            className={inputBase}
          />
        </div>
      </div>

      {/* Stop showing after */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Stop showing after <span className="font-normal">(optional)</span>
        </label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className={inputBase + " w-auto"}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          While active, the popup shows on every page load (snoozable for 1 hour by the member).
        </p>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={submit}
          disabled={pending || !title || !body}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {pending ? "Sending…" : "Send announcement"}
        </button>
        {msg && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
            <Check className="h-3.5 w-3.5" />
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
