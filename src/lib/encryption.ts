/**
 * AES-256-GCM encryption for sensitive credential storage.
 *
 * Used to encrypt PaymentMethod credentials (Paymob API keys, Stripe keys, etc.)
 * before they're stored in the database.
 *
 * The encryption key is read from ENCRYPTION_KEY env var, which must be a
 * 64-character hex string (32 bytes = 256-bit key).
 *
 * Generate a key:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Ciphertext format (Base64-encoded):
 *   <12-byte IV> + <ciphertext> + <16-byte auth tag>
 * All concatenated before Base64 encoding.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;  // 96 bits recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes). " +
        'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt a plaintext string. Returns a Base64-encoded ciphertext. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Encode: iv (12) + encrypted (n) + tag (16)
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

/** Decrypt a Base64-encoded ciphertext produced by encrypt(). */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const data = Buffer.from(ciphertext, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

/** Encrypt a JSON-serialisable object. */
export function encryptJson(obj: unknown): string {
  return encrypt(JSON.stringify(obj));
}

/** Decrypt and parse a JSON object encrypted with encryptJson(). */
export function decryptJson<T = unknown>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T;
}
