/**
 * Returns the canonical base URL for the app.
 * Priority: NEXT_PUBLIC_APP_URL → VERCEL_URL (auto-set by Vercel) → localhost.
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
