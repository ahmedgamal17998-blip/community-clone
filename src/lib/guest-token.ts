import { createHmac } from "node:crypto";

/** Build a short HMAC token for guest booking confirmation links. */
export function buildGuestToken(bookingId: string): string {
  const secret = process.env.AUTH_SECRET ?? "dev-secret";
  return createHmac("sha256", secret).update(bookingId).digest("hex").slice(0, 32);
}
