"use client";

/**
 * Textarea with @mention autocomplete (group members).
 * Drop-in for <Textarea /> where a groupSlug is known.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  useMentionAutocomplete,
  type MentionUser,
} from "@/components/mention/useMentionAutocomplete";

type Props = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange" | "value"
> & {
  value: string;
  onChange: (next: string) => void;
  groupSlug: string;
};

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionTextarea({ value, onChange, groupSlug, onKeyDown, ...rest }, ref) {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    const {
      open,
      suggestions,
      activeIndex,
      setActiveIndex,
      insert,
      onKeyDown: hookKeyDown,
      onSelectionChange,
    } = useMentionAutocomplete({
      groupSlug,
      value,
      onChange,
      textareaRef: innerRef,
    });

    return (
      <div className="relative">
        <Textarea
          {...rest}
          ref={innerRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            hookKeyDown(e);
            if (!e.defaultPrevented) onKeyDown?.(e);
          }}
          onKeyUp={onSelectionChange}
          onClick={onSelectionChange}
        />
        {open ? (
          <div className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-border bg-card shadow-md">
            <ul>
              {suggestions.map((u: MentionUser, i) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={(e) => {
                      e.preventDefault();
                      insert(u.handle);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
                      i === activeIndex ? "bg-accent" : "hover:bg-accent"
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold">
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (u.name ?? u.handle).slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{u.name ?? u.handle}</span>{" "}
                      <span className="text-muted-foreground">@{u.handle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  },
);
