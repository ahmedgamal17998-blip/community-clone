/**
 * AES-256-GCM envelope encryption for small secrets (Google refresh tokens).
 *
 * Sealed payload layout (base64):
 *   [ 12-byte nonce | ciphertext | 16-byte tag ]
 *
 * Key sourcing:
 *   - prefer TOKEN_ENCRYPTION_KEY (32-byte base64)
 *   - dev fallback: sha256(AUTH_SECRET) — log a one-shot warning so the noise
 *     doesn't spam on hot reload
 *   - prod (NODE_ENV === "production") without TOKEN_ENCRYPTION_KEY throws
 */
import crypto from "node:crypto";

let warned = false;
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.TOKEN_ENCRYPTION_KEY;
  if (fromEnv && fromEnv.length > 0) {
    const buf = Buffer.from(fromEnv, "base64");
    if (buf.length !== 32) {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64).",
      );
    }
    cachedKey = buf;
    return buf;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is required in production (base64 32 bytes).",
    );
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Cannot derive encryption key: neither TOKEN_ENCRYPTION_KEY nor AUTH_SECRET is set.",
    );
  }
  if (!warned) {
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[crypto-box] TOKEN_ENCRYPTION_KEY unset — deriving dev key from AUTH_SECRET. Do NOT ship this to production.",
    );
  }
  cachedKey = crypto.createHash("sha256").update(secret).digest();
  return cachedKey;
}

export function sealBox(plaintext: string): string {
  const key = getKey();
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ct, tag]).toString("base64");
}

export function openBox(sealed: string): string {
  const key = getKey();
  const buf = Buffer.from(sealed, "base64");
  if (buf.length < 12 + 16) {
    throw new Error("sealed payload too short");
  }
  const nonce = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
