/**
 * Dev-only: creates a valid NextAuth DB session for a seeded user and prints
 * the cookie value you need to paste into the browser. Bypasses magic-link.
 *
 * Usage: tsx --env-file=.env prisma/dev-login.ts alex@example.com
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx prisma/dev-login.ts <email>");
    process.exit(1);
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No seeded user with email ${email}. Run \`npm run db:seed\` first.`);
    process.exit(1);
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  console.log(`\n✅ Session created for ${user.name} (@${user.handle}).`);
  console.log(`\n👉 Open http://localhost:3000 and run this in the browser DevTools console:\n`);
  console.log(
    `document.cookie = 'authjs.session-token=${sessionToken}; path=/; max-age=2592000';`,
  );
  console.log(`location.href = '/home';\n`);
  console.log(`(Or copy just the token value — it's: ${sessionToken})\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
