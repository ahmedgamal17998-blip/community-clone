/**
 * One-off: make a user the OWNER of a specific group.
 *
 *   npx tsx --env-file=.env scripts/promote-owner-of-group.ts
 *
 * Idempotent. Also bumps the parent Community.ownerId if it points elsewhere.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EMAIL = "ahmedgamal17998@gmail.com";
// Match the group by name (case-insensitive). Falls back to slug if needed.
const GROUP_NAME = "English to Work";

async function main() {
  const user = await db.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    console.log(`No user with email ${EMAIL}. Aborting.`);
    process.exit(1);
  }

  const group = await db.group.findFirst({
    where: {
      OR: [
        { name: { equals: GROUP_NAME, mode: "insensitive" } },
        { slug: GROUP_NAME.toLowerCase().replace(/\s+/g, "-") },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      communityId: true,
      community: { select: { id: true, ownerId: true, name: true } },
    },
  });
  if (!group) {
    console.log(`No group named "${GROUP_NAME}" found. Aborting.`);
    process.exit(1);
  }

  console.log("Target user:", user);
  console.log("Target group:", { id: group.id, slug: group.slug, name: group.name });
  console.log("Parent community:", group.community);

  // 1. Upsert membership as OWNER + ACTIVE.
  const membership = await db.groupMembership.upsert({
    where: {
      groupId_userId: { groupId: group.id, userId: user.id },
    },
    update: { role: "OWNER", state: "ACTIVE", lockedAt: null },
    create: {
      groupId: group.id,
      userId: user.id,
      role: "OWNER",
      state: "ACTIVE",
    },
  });
  console.log("\nMembership upserted:", {
    id: membership.id,
    role: membership.role,
    state: membership.state,
  });

  // 2. Demote any other OWNER memberships in this group to ADMIN so there's
  //    one canonical owner.
  const demoted = await db.groupMembership.updateMany({
    where: {
      groupId: group.id,
      role: "OWNER",
      NOT: { userId: user.id },
    },
    data: { role: "ADMIN" },
  });
  if (demoted.count > 0) {
    console.log(`Demoted ${demoted.count} previous OWNER(s) to ADMIN.`);
  } else {
    console.log("No other OWNER memberships to demote.");
  }

  // 3. If the parent Community has a different ownerId, repoint it.
  if (group.community.ownerId !== user.id) {
    await db.community.update({
      where: { id: group.community.id },
      data: { ownerId: user.id },
    });
    console.log(
      `Community "${group.community.name}" ownerId switched to ${user.id}.`,
    );
  } else {
    console.log("Community ownerId already correct.");
  }
}

main().finally(() => db.$disconnect());
