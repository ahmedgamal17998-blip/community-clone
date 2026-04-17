/** Derive 2-letter initials from a name, handling Arabic gracefully. */
export function initialsFrom(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => Array.from(p)[0] ?? "").join("").toUpperCase() || "?";
}
