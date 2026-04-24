/**
 * Stripe server/client helpers (M16).
 * Both functions return null when the relevant env var is unset so the app
 * degrades gracefully — PAID courses show "Payment coming soon" instead of
 * crashing.
 */

import type Stripe from "stripe";

// ─── Server singleton ──────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripeServer(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  if (!_stripe) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const StripeLib = require("stripe") as typeof import("stripe").default;
    _stripe = new StripeLib(key, { apiVersion: "2026-04-22.dahlia" });
  }
  return _stripe;
}

// ─── Publishable key (safe to expose to browser) ───────────────────────────

export function getStripePK(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}
