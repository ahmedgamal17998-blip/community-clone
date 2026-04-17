/**
 * Wraps group-scoped pages in a div that overrides --brand / --primary
 * CSS vars using the group's `primaryHsl` triplet.
 *
 * Because the vars are declared on :root as `H S% L%` (no color functions),
 * we can remap them inline without touching anything else. All children that
 * use Tailwind `bg-primary`, `bg-brand-600`, `ring-ring`, etc. repaint.
 */
import type { CSSProperties, ReactNode } from "react";

type Props = {
  primaryHsl: string;
  children: ReactNode;
};

export function GroupThemeProvider({ primaryHsl, children }: Props) {
  // Derive a "hover" tint by bumping lightness -6% (clamped ≥10%).
  const [h, s, l] = primaryHsl.split(/\s+/);
  const lNum = parseInt(l, 10);
  const hover = `${h} ${s} ${Math.max(10, lNum - 6)}%`;

  const style = {
    "--primary": primaryHsl,
    "--brand-500": primaryHsl,
    "--brand-600": hover,
    "--ring": primaryHsl,
  } as CSSProperties;

  return (
    <div style={style} className="contents">
      {children}
    </div>
  );
}
