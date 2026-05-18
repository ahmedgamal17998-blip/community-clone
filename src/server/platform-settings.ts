/**
 * Platform settings — super-admin key/value store.
 *
 * Keys (namespaced):
 *   "content.retentionDays"        number   default: 90
 *   "platform.activeGateway"       string   "STRIPE" | "SUBSCRIPTION_BASE" | "NONE"
 *   "platform.stripeCredentials"   string   encrypted JSON
 *   "platform.subBaseCredentials"  string   encrypted JSON
 */
"use server";

import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/super-admin";
import { encryptJson, decryptJson } from "@/lib/encryption";

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS: Record<string, string> = {
  "content.retentionDays":  JSON.stringify(90),
  "platform.activeGateway": JSON.stringify("NONE"),
};

// ─── Raw read/write (internal) ───────────────────────────────────────────────

async function getRaw(key: string): Promise<string | null> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? null;
}

async function setRaw(key: string, value: string): Promise<void> {
  await db.platformSetting.upsert({
    where:  { key },
    update: { value },
    create: { key, value },
  });
}

// ─── Typed getters ────────────────────────────────────────────────────────────

export async function getContentRetentionDays(): Promise<number> {
  const raw = await getRaw("content.retentionDays");
  const n = raw ? (JSON.parse(raw) as number) : 90;
  return n > 0 ? n : 90;
}

export type GatewayMode = "NONE" | "STRIPE" | "SUBSCRIPTION_BASE" | "BOTH";

export async function getActiveGateway(): Promise<GatewayMode> {
  const raw = await getRaw("platform.activeGateway");
  const val = raw ? (JSON.parse(raw) as string) : "NONE";
  if (val === "STRIPE" || val === "SUBSCRIPTION_BASE" || val === "BOTH") return val;
  return "NONE";
}

/** Returns true when Stripe is active (STRIPE or BOTH). */
export async function isStripeActive(): Promise<boolean> {
  const gw = await getActiveGateway();
  return gw === "STRIPE" || gw === "BOTH";
}

/** Returns true when Subscription-base is active (SUBSCRIPTION_BASE or BOTH). */
export async function isSubBaseActive(): Promise<boolean> {
  const gw = await getActiveGateway();
  return gw === "SUBSCRIPTION_BASE" || gw === "BOTH";
}

// ─── Stripe credential helpers ────────────────────────────────────────────────

export interface StripeCredentials {
  secretKey:     string;
  publishableKey: string;
  webhookSecret: string;
}

export async function getStripeCredentials(): Promise<StripeCredentials | null> {
  const raw = await getRaw("platform.stripeCredentials");
  if (!raw || raw === "null") return null;
  try { return decryptJson<StripeCredentials>(raw); }
  catch { return null; }
}

async function saveStripeCredentials(creds: StripeCredentials): Promise<void> {
  await setRaw("platform.stripeCredentials", encryptJson(creds));
}

// ─── Subscription-base credential helpers ─────────────────────────────────────

export interface SubBaseCredentials {
  baseUrl:    string;
  adminApiKey: string;
}

export async function getSubBaseCredentials(): Promise<SubBaseCredentials | null> {
  const raw = await getRaw("platform.subBaseCredentials");
  if (!raw || raw === "null") return null;
  try { return decryptJson<SubBaseCredentials>(raw); }
  catch { return null; }
}

async function saveSubBaseCredentials(creds: SubBaseCredentials): Promise<void> {
  await setRaw("platform.subBaseCredentials", encryptJson(creds));
}

// ─── Super-admin actions ──────────────────────────────────────────────────────

async function assertSuperAdmin(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (!(await isSuperAdmin(session.user.id))) throw new Error("Forbidden");
  return session.user.id;
}

export async function saveContentRetentionAction(
  days: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertSuperAdmin();
    if (days < 1 || days > 3650) return { ok: false, error: "Must be between 1 and 3650 days" };
    await setRaw("content.retentionDays", JSON.stringify(days));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveActiveGatewayAction(
  gateway: GatewayMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertSuperAdmin();
    await setRaw("platform.activeGateway", JSON.stringify(gateway));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveStripeAction(
  creds: StripeCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertSuperAdmin();
    if (!creds.secretKey.startsWith("sk_")) return { ok: false, error: "Invalid Stripe secret key (must start with sk_)" };
    if (!creds.publishableKey.startsWith("pk_")) return { ok: false, error: "Invalid Stripe publishable key (must start with pk_)" };
    await saveStripeCredentials(creds);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveSubBaseAction(
  creds: SubBaseCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertSuperAdmin();
    if (!creds.baseUrl.startsWith("http")) return { ok: false, error: "Invalid base URL" };
    await saveSubBaseCredentials(creds);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Read-all for settings page ───────────────────────────────────────────────

export async function getPlatformSettingsForPage() {
  const [retentionDays, activeGateway, stripe, subBase] = await Promise.all([
    getContentRetentionDays(),
    getActiveGateway(),
    getStripeCredentials(),
    getSubBaseCredentials(),
  ]);

  return {
    retentionDays,
    activeGateway,                           // "NONE" | "STRIPE" | "SUBSCRIPTION_BASE" | "BOTH"
    stripeConfigured:   !!stripe,
    stripePublishableKey: stripe?.publishableKey ?? "",
    // NEVER return secret keys to the browser — return only masked status
    subBaseConfigured:  !!subBase,
    subBaseUrl:         subBase?.baseUrl ?? "",
  };
}
