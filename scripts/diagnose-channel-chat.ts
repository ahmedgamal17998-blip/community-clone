/**
 * Diagnose why a user can't open a channel's chat (404).
 *
 *   npx tsx --env-file=.env scripts/diagnose-channel-chat.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EMAIL = "ahmedgamal17998@gmail.com";
const GROUP_SLUG = "english-to-work";
const CHANNEL_SLUG = "beginner";

async function main() {
  const user = await db.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, name: true, email: true },
  });
  if (!user) return console.log("User not found");

  const channel = await db.channel.findFirst({
    where: { slug: CHANNEL_SLUG, group: { slug: GROUP_SLUG } },
    include: {
      chatThread: {
        include: {
          participants: { select: { userId: true } },
        },
      },
      group: {
        select: { id: true, name: true },
      },
    },
  });
  if (!channel) return console.log("Channel not found");

  console.log("User:", user);
  console.log("Channel:", {
    id: channel.id,
    slug: channel.slug,
    kind: channel.kind,
    visibility: channel.visibility,
    chatEnabled: channel.chatEnabled,
    archived: channel.archived,
  });
  console.log(
    "Thread:",
    channel.chatThread
      ? {
          id: channel.chatThread.id,
          participantCount: channel.chatThread.participants.length,
          userIsParticipant: channel.chatThread.participants.some(
            (p) => p.userId === user.id,
          ),
          participantIds: channel.chatThread.participants.map((p) => p.userId),
        }
      : "NO THREAD",
  );

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: channel.group.id, userId: user.id },
    },
    select: { role: true, state: true },
  });
  console.log("Membership:", membership);

  // List all members of this channel's group with their roles
  const allMembers = await db.groupMembership.findMany({
    where: { groupId: channel.group.id, state: "ACTIVE" },
    include: { user: { select: { name: true, email: true } } },
  });
  console.log(
    "\nAll active members of group:",
    allMembers.map((m) => ({
      role: m.role,
      name: m.user.name,
      email: m.user.email,
    })),
  );
}

main().finally(() => db.$disconnect());
