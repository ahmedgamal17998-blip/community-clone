/**
 * One-off: set password + canCreateGroups on the owner account.
 *
 *   npx tsx --env-file=.env scripts/promote-owner.ts
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const EMAIL = "ahmedgamal17998@gmail.com";
const PLAINTEXT = "Capitano98!";

async function main() {
  const existing = await db.user.findUnique({
    where: { email: EMAIL },
    select: {
      id: true,
      name: true,
      handle: true,
      canCreateGroups: true,
      passwordHash: true,
    },
  });
  if (!existing) {
    console.log(`No user with email ${EMAIL} found. Sign in first.`);
    process.exit(1);
  }
  console.log("Before:", { ...existing, passwordHash: existing.passwordHash ? "[set]" : null });

  const hash = await bcrypt.hash(PLAINTEXT, 12);
  const updated = await db.user.update({
    where: { email: EMAIL },
    data: { passwordHash: hash, canCreateGroups: true },
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      canCreateGroups: true,
      passwordHash: true,
    },
  });
  console.log("After:", {
    ...updated,
    passwordHash: updated.passwordHash ? `[hash:${updated.passwordHash.length}c]` : null,
  });
}

main().finally(() => db.$disconnect());
