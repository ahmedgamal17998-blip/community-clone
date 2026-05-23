/**
 * Payment SSO — HMAC-SHA256 token for the nadi ↔ subsc handshake.
 *
 * Both systems share `PAYMENT_SSO_SECRET`. nadi (community-clone) mints a
 * short-lived token containing the member's verified identity from the
 * current session. subsc verifies the signature server-side, pre-fills the
 * checkout form fields, and makes them read-only so the user can't swap
 * their email/name.
 *
 * Token format: `<base64url(JSON payload)>.<hex(HMAC-SHA256)>`
 * TTL: 10 minutes (enough time to complete checkout in the iframe).
 *
 * Pattern mirrors src/lib/booky-sso.ts (signer side).
 * Pure helpers — no DB calls, safe to import on edge runtimes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentSsoPayload = {
  /** Community user id — used by subsc for audit logs only. */
  sub: string;
  /** Full name — pre-filled into the checkout form. */
  name: string;
  /** Email — pre-filled into the checkout form (locked). */
  email: string;
  /** Phone (optional) — pre-filled if present. */
  phone?: string;
  /** The plan slug/id this token authorises — prevents token reuse across plans. */
  planSlug: string;
  /** Origin group id — for audit trail. */
  groupId: string;
  /** Seconds since epoch */
  iat: number;
  exp: number;
};

const TTL_SECONDS = 10 * 60; // 10 minutes

function getSecret(): string {
  const s = process.env.PAYMENT_SSO_SECRET;
  if (!s || s.length < 16) {
    throw new Error("PAYMENT_SSO_SECRET env is missing or too short (need 16+ chars)");
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
 * Mint a token authorising one user to check out one plan.
 * Call this server-side only (checkout page server component).
 */
export function signPaymentSsoToken(
  payload: Omit<PaymentSsoPayload, "iat" | "exp">,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: PaymentSsoPayload = { ...payload, iat: now, exp: now + TTL_SECONDS };
  const body = b64url(JSON.stringify(full));
  const sig = createHmac("sha256", getSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

// ─── Verifier (used by subsc — mirrored here for tests / future admin use) ───

export type VerifyResult =
  | { ok: true; payload: PaymentSsoPayload }
  | { ok: false; error: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" };

export function verifyPaymentSsoToken(token: string): VerifyResult {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, error: "MALFORMED" };
  }
  const dot = token.lastIndexOf(".");
  const body = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  if (!body || !sig) return { ok: false, error: "MALFORMED" };

  const expectedSig = createHmac("sha256", getSecret()).update(body).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "BAD_SIGNATURE" };
  }

  let payload: PaymentSsoPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8")) as PaymentSsoPayload;
  } catch {
    return { ok: false, error: "MALFORMED" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return { ok: false, error: "EXPIRED" };
  }
  return { ok: true, payload };
}
