/**
 * @handle generator.
 *
 * Mirrors the ClientClub/Kollab pattern seen in the audit:
 *   @mohamed-abuelelaa-6kAzYI  →  slug(name) + "-" + 6-char suffix
 *
 * The suffix makes handles collision-resistant without needing a retry loop
 * for the common case. If a collision does occur on insert, regenerate.
 */

const DISALLOWED = /[^a-z0-9\-]/g;

/** Slugify: lowercase, strip diacritics, replace non-alphanum with "-". */
function slug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")          // strip combining marks (Arabic diacritics etc.)
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(DISALLOWED, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "user";
}

/** Random 6-char suffix (alphanumeric, mixed case — matches observed pattern). */
function suffix(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function generateHandle(name: string | null | undefined): string {
  return `${slug(name ?? "user")}-${suffix()}`;
}
