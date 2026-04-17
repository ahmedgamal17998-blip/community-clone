"use client";

import { useMemo } from "react";

type Props = {
  value: string; // "H S% L%"
  onChange: (next: string) => void;
};

function parse(hsl: string): { h: number; s: number; l: number } {
  const m = hsl.match(/^(\d{1,3})\s+(\d{1,3})%\s+(\d{1,3})%$/);
  if (!m) return { h: 263, s: 74, l: 58 };
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function format(h: number, s: number, l: number): string {
  return `${h} ${s}% ${l}%`;
}

export function ColorPicker({ value, onChange }: Props) {
  const { h, s, l } = useMemo(() => parse(value), [value]);
  const css = `hsl(${h}, ${s}%, ${l}%)`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: css }}
          aria-label="Color preview"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 flex-1 rounded-md border border-border bg-background px-2 font-mono text-sm"
          placeholder="263 74% 58%"
        />
      </div>
      <label className="block text-xs text-muted-foreground">
        Hue ({h})
        <input
          type="range"
          min={0}
          max={360}
          value={h}
          onChange={(e) => onChange(format(Number(e.target.value), s, l))}
          className="mt-1 w-full"
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Saturation ({s}%)
        <input
          type="range"
          min={0}
          max={100}
          value={s}
          onChange={(e) => onChange(format(h, Number(e.target.value), l))}
          className="mt-1 w-full"
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Lightness ({l}%)
        <input
          type="range"
          min={0}
          max={100}
          value={l}
          onChange={(e) => onChange(format(h, s, Number(e.target.value)))}
          className="mt-1 w-full"
        />
      </label>
    </div>
  );
}
