"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setLeavePopupAction } from "../actions";

const inputBase =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

type Initial = {
  enabled: boolean;
  body: string;
  fontFamily: string;
  fontSizePx: number;
  color: string;
  bold: boolean;
  stayLabel: string;
  leaveLabel: string;
};

const FONT_OPTIONS = [
  { label: "Default", value: "" },
  { label: "Sans (Inter)", value: "Inter, system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, monospace" },
  { label: "Rounded", value: "'SF Pro Rounded', 'Nunito', system-ui, sans-serif" },
  { label: "Cairo (Arabic)", value: "'Cairo', system-ui, sans-serif" },
];

export function LeavePopupForm({
  groupId,
  initial,
}: {
  groupId: string;
  initial: Initial;
}) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [body, setBody] = useState(initial.body);
  const [fontFamily, setFontFamily] = useState(initial.fontFamily);
  const [fontSizePx, setFontSizePx] = useState<number>(initial.fontSizePx);
  const [color, setColor] = useState(initial.color || "#0f172a");
  const [bold, setBold] = useState(initial.bold);
  const [stayLabel, setStayLabel] = useState(initial.stayLabel);
  const [leaveLabel, setLeaveLabel] = useState(initial.leaveLabel);
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    startTransition(async () => {
      await setLeavePopupAction({
        groupId,
        enabled,
        body: body || null,
        fontFamily: fontFamily || null,
        fontSizePx: fontSizePx > 0 ? fontSizePx : null,
        color: color || null,
        bold,
        stayLabel: stayLabel || null,
        leaveLabel: leaveLabel || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

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

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        Enable leave-attempt popup
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Stay button label
          </span>
          <input
            type="text"
            value={stayLabel}
            onChange={(e) => setStayLabel(e.target.value)}
            placeholder="Stay with us"
            maxLength={40}
            className={inputBase}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Leave button label
          </span>
          <input
            type="text"
            value={leaveLabel}
            onChange={(e) => setLeaveLabel(e.target.value)}
            placeholder="Leave anyway"
            maxLength={40}
            className={inputBase}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">
          Message (use **word** to bold a phrase)
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Are you sure? You'll lose access to **all premium content** if you leave."
          className={inputBase}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Font
          </span>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className={inputBase}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Size (px)
          </span>
          <input
            type="number"
            min={10}
            max={32}
            value={fontSizePx}
            onChange={(e) => setFontSizePx(Number(e.target.value))}
            className={inputBase}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Color
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color || "#0f172a"}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-input"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#0f172a"
              className={inputBase}
            />
          </div>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={bold}
          onChange={(e) => setBold(e.target.checked)}
          className="h-4 w-4"
        />
        Bold the entire message
      </label>

      {/* Live preview */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </p>
        <div
          className="whitespace-pre-wrap leading-relaxed"
          style={{
            fontFamily: fontFamily || undefined,
            fontSize: fontSizePx ? `${fontSizePx}px` : undefined,
            color: color || undefined,
            fontWeight: bold ? 700 : undefined,
          }}
        >
          {body
            ? renderRichText(body)
            : "Are you sure you want to leave this group? You can rejoin any time."}
        </div>
        <div className="mt-3 flex gap-2">
          <span className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {stayLabel || "Stay with us"}
          </span>
          <span className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground">
            {leaveLabel || "Leave anyway"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
