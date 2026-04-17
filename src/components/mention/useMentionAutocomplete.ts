"use client";

/**
 * Minimal @mention autocomplete hook.
 *
 * - Attach to a textarea via `bind()`.
 * - Watches `selectionStart` to find the last "@word" the cursor is in.
 * - Fetches `/api/groups/{slug}/member-search?q=...` debounced.
 * - Returns suggestions + an `insert(handle)` helper.
 * - Caller is responsible for rendering the floating list. `open` and
 *   `activeIndex` drive keyboard nav (Arrow/Tab/Enter/Escape).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type MentionUser = {
  id: string;
  name: string | null;
  handle: string;
  image: string | null;
};

type Args = {
  groupSlug: string;
  value: string;
  onChange: (next: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
};

// Find the @-token the caret is currently inside, if any.
function findMentionContext(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  if (caret === 0) return null;
  // Scan backward from caret for @ or whitespace.
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === "@") {
      // Check preceding char must be start-of-string or non-word.
      const prev = i > 0 ? value[i - 1] : " ";
      if (/[A-Za-z0-9_]/.test(prev)) return null;
      const query = value.slice(i + 1, caret);
      if (!/^[a-zA-Z0-9_-]*$/.test(query)) return null;
      return { start: i, query };
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

export function useMentionAutocomplete({
  groupSlug,
  value,
  onChange,
  textareaRef,
}: Args) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [start, setStart] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? 0;
    const ctx = findMentionContext(value, caret);
    if (ctx === null) {
      setOpen(false);
      setStart(null);
      return;
    }
    setStart(ctx.start);
    setQuery(ctx.query);
    setOpen(true);
    setActiveIndex(0);
  }, [textareaRef, value]);

  useEffect(() => {
    check();
  }, [check]);

  // Debounced fetch.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/groups/${encodeURIComponent(groupSlug)}/member-search?q=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { results: MentionUser[] };
        setSuggestions(data.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [groupSlug, open, query]);

  const insert = useCallback(
    (handle: string) => {
      const ta = textareaRef.current;
      if (ta === null || start === null) return;
      const caret = ta.selectionStart ?? 0;
      const before = value.slice(0, start);
      const after = value.slice(caret);
      const insertion = `@${handle} `;
      const next = before + insertion + after;
      onChange(next);
      setOpen(false);
      // Restore caret after inserted handle.
      const newCaret = before.length + insertion.length;
      requestAnimationFrame(() => {
        if (ta) {
          ta.focus();
          ta.setSelectionRange(newCaret, newCaret);
        }
      });
    },
    [onChange, start, textareaRef, value],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open || suggestions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const u = suggestions[activeIndex];
        if (u) insert(u.handle);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [activeIndex, insert, open, suggestions],
  );

  return {
    open: open && suggestions.length > 0,
    suggestions,
    activeIndex,
    setActiveIndex,
    insert,
    onKeyDown,
    onSelectionChange: check,
  };
}
