/**
 * One-time backfill: any user who already owns at least one group keeps
 * the right to create new groups. Run once after the schema migration.
 *
 *   npx tsx scripts/backfill-can-create-groups.ts
 */
import { db } from "@/server/db";

async function main() {
  // Find all distinct OWNER user IDs.
  const owners = await db.groupMembership.findMany({
    where: { role: "OWNER" },
    select: { userId: true },
    distinct: ["userId"],
  });
  const ownerIds = owners.map((o) => o.userId);

  if (ownerIds.length === 0) {
    console.log("No existing owners — nothing to backfill.");
    return;
  }

  const result = await db.user.updateMany({
    where: { id: { in: ownerIds } },
    data: { canCreateGroups: true },
  });

  console.log(`Backfilled canCreateGroups=true for ${result.count} user(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
