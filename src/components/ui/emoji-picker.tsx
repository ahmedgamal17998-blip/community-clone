"use client";

import { useEffect, useRef, useState } from "react";
import { Smile, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free emoji picker.
 *
 * Renders a single trigger button showing the currently picked emoji (or a
 * placeholder smile). Clicking opens a dropdown grid of curated emojis
 * grouped by category. The selected emoji is mirrored into a hidden input
 * with the given `name`, so this component drops straight into a server
 * action <form>.
 *
 * Users can clear the selection (×) or paste a custom emoji via the small
 * inline input below the grid — keeps the curated UX without limiting
 * power users.
 */

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Popular",
    emojis: [
      "💬", "📣", "📢", "👋", "✨", "🎉", "🔥", "💡", "📌", "🚀",
      "⭐", "🎯", "📚", "🎓", "🧠", "💪", "🙌", "👏", "🤝", "💯",
    ],
  },
  {
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😊", "🙂", "😉", "😎", "🤓", "🥳",
      "😇", "🤩", "😍", "🤔", "😅", "😂", "🤣", "😜", "😴", "🫶",
    ],
  },
  {
    label: "Learning",
    emojis: [
      "📖", "📝", "✏️", "🖊️", "🗒️", "📒", "📕", "📗", "📘", "📙",
      "🎒", "🏫", "👩‍🏫", "👨‍🏫", "👩‍🎓", "👨‍🎓", "🧑‍💻", "💻", "📱", "🔬",
    ],
  },
  {
    label: "Symbols",
    emojis: [
      "✅", "❤️", "💖", "💛", "💙", "💚", "💜", "🧡", "🤍", "🖤",
      "🔔", "🔒", "🔓", "🌟", "⚡", "🌈", "☀️", "🌙", "🎵", "🏆",
    ],
  },
  {
    label: "Activities",
    emojis: [
      "🎤", "🎧", "🎨", "🎬", "📷", "🎮", "🏀", "⚽", "🏋️", "🧘",
      "🏃", "🚴", "🥗", "☕", "🍎", "🌍", "✈️", "🗺️", "🏝️", "🌳",
    ],
  },
];

type Props = {
  /** Hidden input name (used by the surrounding <form>). */
  name: string;
  /** Initial value (e.g. when editing an existing channel). */
  defaultValue?: string;
  /** id for the visible trigger button (so a <Label htmlFor=...> works). */
  id?: string;
  /** Optional label shown to the right of the trigger when no emoji set. */
  placeholder?: string;
  /** Optional class for the outer wrapper. */
  className?: string;
};

export function EmojiPicker({
  name,
  defaultValue = "",
  id,
  placeholder = "Pick an emoji",
  className,
}: Props) {
  const [value, setValue] = useState<string>(defaultValue);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={cn("relative inline-block", className)}>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-2">
        <button
          id={id}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-xl transition-colors",
            "hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/40",
          )}
        >
          {value ? (
            <span aria-hidden>{value}</span>
          ) : (
            <Smile className="h-5 w-5 text-muted-foreground" aria-hidden />
          )}
          <span className="sr-only">{placeholder}</span>
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear emoji"
          >
            <X className="h-3 w-3" aria-hidden />
            Clear
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{placeholder}</span>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className="absolute z-50 mt-2 w-[20rem] rounded-lg border border-border bg-popover p-3 shadow-lg"
        >
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {cat.label}
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        setValue(e);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded text-lg transition-colors",
                        "hover:bg-muted focus:bg-muted focus:outline-none",
                        value === e && "bg-primary/10 ring-1 ring-primary",
                      )}
                      aria-label={`Pick ${e}`}
                    >
                      <span aria-hidden>{e}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <label className="block text-xs text-muted-foreground">
              Or paste a custom emoji:
              <input
                type="text"
                maxLength={4}
                defaultValue={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                placeholder="🌸"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
