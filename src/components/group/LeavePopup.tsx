"use client";

/**
 * LeavePopup — retention dialog shown when a member taps "Leave" on the
 * group header. Hijacks the leave form's submit so we can show the popup
 * first; the user can then confirm (calls the original leave action) or
 * stay (popup closes).
 *
 * The popup body, font, color, bold, and button labels are admin-configurable
 * via Group.leavePopup* fields (rendered server-side and passed in as props).
 *
 * Body supports inline **bold** markers — tokens between `**` render bold.
 */

import { useEffect, useRef, useState, useTransition } from "react";

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
  /** Server action that actually performs the leave (takes groupId). */
  onLeaveAction: (groupId: string) => Promise<void> | void;
};

/** Render a string with **bold** tokens converted to <strong>. */
function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
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
  onLeaveAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function handleTriggerClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!enabled) return; // popup disabled → submit the form normally
    e.preventDefault();
    setOpen(true);
  }

  function confirmLeave() {
    startTransition(async () => {
      await onLeaveAction(groupId);
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type={enabled ? "button" : "submit"}
        onClick={handleTriggerClick}
        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-3"
      >
        {leaveLabel || "Leave"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
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
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                >
                  {stayLabel || "Stay with us"}
                </button>
                <button
                  type="button"
                  onClick={confirmLeave}
                  disabled={pending}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {pending ? "Leaving…" : leaveLabel || "Leave anyway"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
