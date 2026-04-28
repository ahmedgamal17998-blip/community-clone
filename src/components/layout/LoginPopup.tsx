"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * M20: LoginPopup — shown once per session when a group has loginPopupEnabled.
 * Uses sessionStorage to mark "seen" so it doesn't re-show on every page nav.
 */
export function LoginPopup({
  groupSlug,
  title,
  body,
  ctaUrl,
  durationSec,
}: {
  groupSlug: string;
  title: string;
  body: string;
  ctaUrl?: string | null;
  durationSec: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = `login-popup-seen:${groupSlug}`;
    if (typeof window === "undefined") return;
    const seen = sessionStorage.getItem(key);
    if (seen) return;
    setOpen(true);
    sessionStorage.setItem(key, "1");

    if (durationSec > 0) {
      const t = setTimeout(() => setOpen(false), durationSec * 1000);
      return () => clearTimeout(t);
    }
  }, [groupSlug, durationSec]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
        {ctaUrl && (
          <div className="mt-4">
            <Link
              href={ctaUrl}
              onClick={() => setOpen(false)}
              className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Open
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
