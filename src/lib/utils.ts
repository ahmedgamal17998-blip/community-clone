import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Classname helper: merges Tailwind classes intelligently. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Relative time: "4h ago", "2d ago" — matches the audit's member-row pattern. */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
