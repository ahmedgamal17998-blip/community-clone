"use client";

/**
 * LoginPopup configuration form — visually mirrors the popup it produces:
 *   • Group-primary accent ring on focused inputs (harmonizes with theme)
 *   • Solid 100% opacity inputs, high contrast in light + dark
 *   • Clear labels, generous spacing, professional and uncluttered
 */

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setLoginPopupAction } from "../actions";

const inputBase =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50";

export function LoginPopupForm({
  groupId,
  initial,
}: {
  groupId: string;
  initial: {
    enabled: boolean;
    title: string;
    body: string;
    ctaUrl: string;
    durationSec: number;
    reshowHours: number;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [ctaUrl, setCtaUrl] = useState(initial.ctaUrl);
  const [durationSec, setDurationSec] = useState(initial.durationSec);
  const [reshowHours, setReshowHours] = useState(initial.reshowHours);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await setLoginPopupAction({
        groupId,
        enabled,
        title: title || null,
        body: body || null,
        ctaUrl: ctaUrl || null,
        durationSec,
        reshowHours,
      });
      setSaved(true);
    });
  };

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
        />
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">
            Enable login popup
          </div>
          <div className="text-xs text-muted-foreground">
            Shown once on sign-in and at each new session start.
          </div>
        </div>
      </label>

      <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Title
          </label>
          <input
            type="text"
            placeholder="Welcome back!"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputBase}
            disabled={!enabled}
          />
        </div>

        {/* Auto-close duration */}
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
            disabled={!enabled}
          />
        </div>

        {/* Re-show cooldown */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Re-show every (hrs)
          </label>
          <input
            type="number"
            min={0}
            max={168}
            value={reshowHours}
            onChange={(e) => setReshowHours(Number(e.target.value))}
            className={inputBase}
            disabled={!enabled}
            title="Hours of idle before the popup re-appears. 0 = every page load. 4 = typical 'back after a break'. 24 = once per day."
          />
        </div>
      </div>

      {/* Body */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Body
        </label>
        <textarea
          placeholder="Tell members what's new, where to head, or just say hi…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className={inputBase + " resize-y"}
          disabled={!enabled}
        />
      </div>

      {/* CTA */}
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
          disabled={!enabled}
        />
      </div>

      {/* Save row */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
