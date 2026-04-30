"use client";

/**
 * LeavePopup — retention dialog shown when a member taps "Leave" on the
 * group header. Two-stage flow:
 *   1. Click trigger → popup opens.
 *   2. Click "Leave anyway" → submits a real <form action={leaveGroupAction}>
 *      which performs the leave and redirects the user.
 *
 * Using a form-with-server-action is more reliable than passing a server
 * action as a prop closure — it's the canonical Next.js pattern, doesn't
 * rely on `useTransition` to forward the redirect, and works even if the
 * deployed bundle hasn't perfectly hashed the action ID.
 */

import { useEffect, useState } from "react";
import { leaveGroupAction } from "@/server/groups";

type Props = {
  enabled: boolean;
  groupId: string;
  body: string | null;
  fontFamily: string | null;
  fontSizePx: number | null;
  color: string | null;
  bold: boolean;
  stayLabel: string | null;
  leaveLabel: string | null;
};

function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function LeavePopup({
  enabled,
  groupId,
  body,
  fontFamily,
  fontSizePx,
  color,
  bold,
  stayLabel,
  leaveLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close popup on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Stay = close. Leave = submit form (defined below).
  const stay = () => setOpen(false);

  if (!enabled) {
    // Popup disabled → render the canonical form directly. Click leaves
    // immediately, no popup.
    return (
      <form action={leaveGroupAction}>
        <input type="hidden" name="groupId" value={groupId} />
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {leaveLabel || "Leave"}
        </button>
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {leaveLabel || "Leave"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
          >
            <div
              className="h-1.5 w-full"
              style={{
                background:
                  "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
              }}
            />
            <div className="px-6 pb-6 pt-5">
              <h2 className="text-lg font-bold">Before you go…</h2>

              {body ? (
                <div
                  className="mt-3 whitespace-pre-wrap leading-relaxed"
                  style={{
                    fontFamily: fontFamily || undefined,
                    fontSize: fontSizePx ? `${fontSizePx}px` : undefined,
                    color: color || undefined,
                    fontWeight: bold ? 700 : undefined,
                  }}
                >
                  {renderRichText(body)}
                </div>
              ) : (
                <p className="mt-3 text-sm text-foreground/80">
                  Are you sure you want to leave this group? You can rejoin
                  any time.
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={stay}
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                >
                  {stayLabel || "Stay with us"}
                </button>

                {/* Real form — clicking this button submits a server action
                    that deletes the membership and redirects. */}
                <form
                  action={leaveGroupAction}
                  onSubmit={() => setSubmitting(true)}
                >
                  <input type="hidden" name="groupId" value={groupId} />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {submitting ? "Leaving…" : leaveLabel || "Leave anyway"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
