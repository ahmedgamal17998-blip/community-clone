/**
 * Payment method server actions.
 *
 * Payment methods are configured per-Tenant and used when members subscribe
 * to paid groups. Credentials are AES-256-GCM encrypted before storage.
 *
 * Types:
 *   MANUAL_VODAFONE_CASH  — admin verifies payment proof manually
 *   MANUAL_INSTAPAY       — same
 *   MANUAL_BANK_TRANSFER  — same
 *   MANUAL_FAWRY          — same
 *   MANUAL_CUSTOM         — any other manual method
 *   PAYMOB                — automated via Paymob webhook
 *   STRIPE                — automated via Stripe webhook
 *   SUBSCRIPTION_BASE     — redirect to external Subscription-base checkout;
 *                           activation driven by /api/webhooks/payment.
 *                           Only available when tenant.subscriptionBaseEnabled = true.
 */
"use server";

import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { encryptJson, decryptJson } from "@/lib/encryption";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethodType =
  | "MANUAL_VODAFONE_CASH"
  | "MANUAL_INSTAPAY"
  | "MANUAL_BANK_TRANSFER"
  | "MANUAL_FAWRY"
  | "MANUAL_CUSTOM"
  | "PAYMOB"
  | "STRIPE"
  | "SUBSCRIPTION_BASE";

export interface ManualCredentials {
  instructions: string;      // shown to member at checkout
  accountDetails: string;    // e.g. "Vodafone Cash: 01012345678"
}

export interface PaymobCredentials {
  apiKey: string;
  integrationId: string;
  hmacSecret: string;
  iframeId?: string;
}

export interface StripeCredentials {
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
}

export interface SubscriptionBaseCredentials {
  /** Base URL of the external Subscription-base system, e.g. "https://p.englishsuperfast.com" */
  baseUrl: string;
  /** API key for admin-facing API calls (creating checkout sessions, querying status) */
  adminApiKey: string;
  /** HMAC-SHA256 secret for verifying inbound webhook events (optional; falls back to PAYMENT_WEBHOOK_SECRET env) */
  webhookSecret?: string;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const MANUAL_TYPES = [
  "MANUAL_VODAFONE_CASH",
  "MANUAL_INSTAPAY",
  "MANUAL_BANK_TRANSFER",
  "MANUAL_FAWRY",
  "MANUAL_CUSTOM",
] as const;

const CreateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(MANUAL_TYPES),
    tenantId: z.string().cuid(),
    label: z.string().min(2).max(80),
    instructions: z.string().min(5).max(500),
    accountDetails: z.string().min(2).max(200),
  }),
  z.object({
    type: z.literal("PAYMOB"),
    tenantId: z.string().cuid(),
    label: z.string().min(2).max(80),
    apiKey: z.string().min(10),
    integrationId: z.string().min(1),
    hmacSecret: z.string().min(10),
    iframeId: z.string().optional(),
  }),
  z.object({
    type: z.literal("STRIPE"),
    tenantId: z.string().cuid(),
    label: z.string().min(2).max(80),
    secretKey: z.string().startsWith("sk_"),
    webhookSecret: z.string().startsWith("whsec_"),
    publishableKey: z.string().startsWith("pk_"),
  }),
  z.object({
    type: z.literal("SUBSCRIPTION_BASE"),
    tenantId: z.string().cuid(),
    label: z.string().min(2).max(80),
    baseUrl: z.string().url(),
    adminApiKey: z.string().min(8),
    webhookSecret: z.string().optional(),
  }),
]);

export type CreatePaymentMethodInput = z.infer<typeof CreateSchema>;

// ─── Guard: caller owns the tenant ───────────────────────────────────────────

async function assertTenantOwner(tenantId: string, userId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { ownerId: true },
  });
  if (!tenant) throw new Error("Tenant not found");
  if (tenant.ownerId !== userId) throw new Error("Unauthorized");
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPaymentMethodAction(
  raw: CreatePaymentMethodInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]!.message };

  const data = parsed.data;

  try {
    await assertTenantOwner(data.tenantId, session.user.id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Build encrypted credentials blob
  let credentialsEnc: string | null = null;
  if (MANUAL_TYPES.includes(data.type as (typeof MANUAL_TYPES)[number])) {
    const d = data as { instructions: string; accountDetails: string };
    const creds: ManualCredentials = {
      instructions:   d.instructions,
      accountDetails: d.accountDetails,
    };
    credentialsEnc = encryptJson(creds);
  } else if (data.type === "PAYMOB") {
    const d = data as { apiKey: string; integrationId: string; hmacSecret: string; iframeId?: string };
    const creds: PaymobCredentials = {
      apiKey:        d.apiKey,
      integrationId: d.integrationId,
      hmacSecret:    d.hmacSecret,
      iframeId:      d.iframeId,
    };
    credentialsEnc = encryptJson(creds);
  } else if (data.type === "STRIPE") {
    const d = data as { secretKey: string; webhookSecret: string; publishableKey: string };
    const creds: StripeCredentials = {
      secretKey:      d.secretKey,
      webhookSecret:  d.webhookSecret,
      publishableKey: d.publishableKey,
    };
    credentialsEnc = encryptJson(creds);
  } else if (data.type === "SUBSCRIPTION_BASE") {
    const d = data as { baseUrl: string; adminApiKey: string; webhookSecret?: string };
    const creds: SubscriptionBaseCredentials = {
      baseUrl:       d.baseUrl,
      adminApiKey:   d.adminApiKey,
      webhookSecret: d.webhookSecret,
    };
    credentialsEnc = encryptJson(creds);
  }

  const pm = await db.paymentMethod.create({
    data: {
      tenantId:      data.tenantId,
      type:          data.type,
      label:         data.label,
      credentialsEnc,
    },
  });

  return { ok: true, id: pm.id };
}

// ─── Update ───────────────────────────────────────────────────────────────────

const UpdateSchema = z.object({
  id:        z.string().cuid(),
  tenantId:  z.string().cuid(),
  label:     z.string().min(2).max(80).optional(),
  active:    z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export async function updatePaymentMethodAction(
  raw: z.infer<typeof UpdateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]!.message };

  const { id, tenantId, ...data } = parsed.data;

  try {
    await assertTenantOwner(tenantId, session.user.id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // If setting as default, clear other defaults first
  if (data.isDefault) {
    await db.paymentMethod.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  await db.paymentMethod.update({ where: { id }, data });
  return { ok: true };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deletePaymentMethodAction(
  id: string,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  try {
    await assertTenantOwner(tenantId, session.user.id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  await db.paymentMethod.delete({ where: { id } });
  return { ok: true };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listPaymentMethods(tenantId: string) {
  return db.paymentMethod.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    // Never return credentialsEnc to the client!
    select: { id: true, type: true, label: true, active: true, isDefault: true, createdAt: true },
  });
}

/** Decrypt and return credentials for server-side use (webhook handlers, payment flow). */
export async function getPaymentMethodCredentials(id: string) {
  const pm = await db.paymentMethod.findUnique({ where: { id }, select: { type: true, credentialsEnc: true } });
  if (!pm?.credentialsEnc) return null;

  const type = pm.type as PaymentMethodType;
  if (type.startsWith("MANUAL_")) return decryptJson<ManualCredentials>(pm.credentialsEnc);
  if (type === "PAYMOB") return decryptJson<PaymobCredentials>(pm.credentialsEnc);
  if (type === "STRIPE") return decryptJson<StripeCredentials>(pm.credentialsEnc);
  if (type === "SUBSCRIPTION_BASE") return decryptJson<SubscriptionBaseCredentials>(pm.credentialsEnc);
  return null;
}
