"use client";

import { useState, useTransition } from "react";
import { setLoginPopupAction } from "../actions";

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
  };
}) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [ctaUrl, setCtaUrl] = useState(initial.ctaUrl);
  const [durationSec, setDurationSec] = useState(initial.durationSec);
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
      });
      setSaved(true);
    });
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable login popup (shown on login & on each session start)
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="text"
          placeholder="Popup title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
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

      <textarea
        placeholder="Popup body (markdown allowed)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />

      <input
        type="url"
        placeholder="CTA link (optional)"
        value={ctaUrl}
        onChange={(e) => setCtaUrl(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-green-600">Saved ✓</span>}
      </div>
    </div>
  );
}
