/**
 * One-off: re-sync chatParticipant rows for every channel in a group.
 *
 *   npx tsx --env-file=.env scripts/fix-channel-participants.ts
 *
 * Use this when channels were created before group memberships were settled
 * (e.g. a PRIVATE channel created while no admin/owner existed yet) so its
 * thread has zero participants and members get a 404 on /chat.
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";
import { syncAllChannelsForGroup, syncChannelParticipants } from "@/server/channels";

const db = new PrismaClient();

const GROUP_SLUG = "english-to-work";

async function main() {
  const group = await db.group.findUnique({
    where: { slug: GROUP_SLUG },
    select: { id: true, name: true },
  });
  if (!group) {
    console.log(`Group "${GROUP_SLUG}" not found.`);
    process.exit(1);
  }
  console.log("Group:", group);

  const channels = await db.channel.findMany({
    where: { groupId: group.id, archived: false },
    select: { id: true, slug: true, kind: true, chatEnabled: true },
  });

  for (const ch of channels) {
    if (!ch.chatEnabled) {
      console.log(`Skipping ${ch.slug} (chatEnabled=false).`);
      continue;
    }
    // Make sure the thread exists, then resync.
    let thread = await db.chatThread.findUnique({ where: { channelId: ch.id } });
    if (!thread) {
      thread = await db.chatThread.create({
        data: { kind: "CHANNEL", channelId: ch.id },
      });
      console.log(`Created missing thread for ${ch.slug}.`);
    }
    await syncChannelParticipants(db, ch.id);
    const after = await db.chatParticipant.count({ where: { threadId: thread.id } });
    console.log(`✓ ${ch.slug} (${ch.kind}) — participants: ${after}`);
  }

  await syncAllChannelsForGroup(db, group.id);
  console.log("\nAll channels resynced.");
}

main().finally(() => db.$disconnect());
