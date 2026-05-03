/**
 * M31 — HMAC signing for the Booky SSO handshake.
 *
 * Both community-clone and Booky share `BOOKY_SSO_SECRET` as an env var.
 * The token is a stateless string `<base64url(payload)>.<hex(hmac)>`
 * carrying user identity + plan-access proof for one offering, valid for
 * 5 minutes. Booky verifies the signature, pre-fills the attendee form,
 * and (when `planAccess: true`) bypasses payment for premium offerings.
 *
 * Pure helpers — no DB calls. Safe to import on edge runtimes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type BookySsoPayload = {
  /** Subject — community user id. */
  sub: string;
  /** Display name pre-filled into attendeeName. */
  name: string;
  /** Email pre-filled into attendeeEmail. */
  email: string;
  /** Booky locator the token authorizes — ties signature to one offering. */
  instructorSlug: string;
  eventSlug: string;
  /** When true, premium pricing is comped. False / absent → user pays normally. */
  planAccess: boolean;
  /** Origin community group id, useful for Booky's audit logs. */
  groupId: string;
  /** ISO seconds since epoch — issued at + expires at. */
  iat: number;
  exp: number;
};

const TTL_SECONDS = 5 * 60;

function getSecret(): string {
  const s = process.env.BOOKY_SSO_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "BOOKY_SSO_SECRET env is missing or too short (need 16+ chars)",
    );
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

/**
 * Produce a token authorizing one user to book one offering. Caller is
 * responsible for verifying the user's plan access BEFORE asking for
 * a token (see `canBookOffering` in src/server/booking-offerings.ts).
 */
export function signBookySsoToken(
  payload: Omit<BookySsoPayload, "iat" | "exp">,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: BookySsoPayload = {
    ...payload,
    iat: now,
    exp: now + TTL_SECONDS,
  };
  const json = JSON.stringify(full);
  const body = b64url(json);
  const sig = createHmac("sha256", getSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: BookySsoPayload }
  | { ok: false; error: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" };

export function verifyBookySsoToken(token: string): VerifyResult {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, error: "MALFORMED" };
  }
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, error: "MALFORMED" };

  const expectedSig = createHmac("sha256", getSecret())
    .update(body)
    .digest("hex");
  // Constant-time compare. Lengths must match for timingSafeEqual.
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "BAD_SIGNATURE" };
  }

  let payload: BookySsoPayload;
  try {
    const json = fromB64url(body).toString("utf8");
    payload = JSON.parse(json) as BookySsoPayload;
  } catch {
    return { ok: false, error: "MALFORMED" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return { ok: false, error: "EXPIRED" };
  }
  return { ok: true, payload };
}
