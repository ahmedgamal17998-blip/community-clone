/**
 * Dev seed (M1 + M2 + M3).
 *
 * Creates:
 *  - 10 users (bilingual bios)
 *  - 2 Communities ("English Super Fast", "Focus Labs")
 *  - 3 Groups ("English to Work", "Arabic Learners", "Deep Work Club")
 *  - GroupMemberships spanning all 4 roles + a REQUESTED and a BANNED state
 *  - 8 Channels across the 3 groups (mix of PUBLIC / PRIVATE / ANNOUNCEMENT),
 *    each with an auto-provisioned CHANNEL ChatThread + eligible ChatParticipants
 *
 * Run: npm run db:seed  (idempotent — upserts on unique keys)
 */
import { PrismaClient } from "@prisma/client";
import { generateHandle } from "../src/lib/handle";
import { ensureChannelThread } from "../src/server/channels";

const prisma = new PrismaClient();

type Role = "OWNER" | "ADMIN" | "CONTRIBUTOR" | "MEMBER";
type State = "ACTIVE" | "REQUESTED" | "BANNED";

type SeedUser = {
  name: string;
  email: string;
  bio: string;
  locale: "en" | "ar";
};

const USERS: SeedUser[] = [
  { name: "Alex Carter",    email: "alex@example.com",    bio: "Community builder. Testing the clone.",                       locale: "en" },
  { name: "Mona Saleh",     email: "mona@example.com",    bio: "مدرّسة لغة إنجليزية — عايشة في القاهرة.",                      locale: "ar" },
  { name: "Jordan Lee",     email: "jordan@example.com",  bio: "Just here to lurk.",                                          locale: "en" },
  { name: "Yara Hassan",    email: "yara@example.com",    bio: "مصممة واجهات، بتعلم إنجليزي على جنب.",                         locale: "ar" },
  { name: "Samir Nour",     email: "samir@example.com",   bio: "Engineer. Deep-work fan.",                                    locale: "en" },
  { name: "Layla Adel",     email: "layla@example.com",   bio: "كاتبة محتوى عربي + إنجليزي.",                                   locale: "ar" },
  { name: "Omar Farouk",    email: "omar@example.com",    bio: "Product manager, remote.",                                    locale: "en" },
  { name: "Nadia Rahim",    email: "nadia@example.com",   bio: "بتتعلم تنظيم الوقت.",                                           locale: "ar" },
  { name: "Chris Okafor",   email: "chris@example.com",   bio: "Data engineer moonlighting as a writer.",                     locale: "en" },
  { name: "Hiba Mansour",   email: "hiba@example.com",    bio: "مترجمة وشغوفة بتعليم اللغات.",                                  locale: "ar" },
];

async function main() {
  console.log("⚙️  Seeding users…");
  const created: Record<string, { id: string; name: string; handle: string }> = {};

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, bio: u.bio, locale: u.locale },
      create: {
        name: u.name,
        email: u.email,
        handle: generateHandle(u.name),
        bio: u.bio,
        locale: u.locale,
        emailVerified: new Date(),
        presence: { create: { status: "OFFLINE" } },
      },
    });
    created[u.email] = { id: user.id, name: user.name ?? "", handle: user.handle };
    console.log(`   ✓ ${u.name}  <${u.email}>  @${user.handle}`);
  }

  console.log("⚙️  Seeding communities + groups…");

  // ─── Community 1: English Super Fast (owned by Alex) ────────────────────────
  const esf = await prisma.community.upsert({
    where: { slug: "english-super-fast" },
    update: {},
    create: {
      slug: "english-super-fast",
      name: "English Super Fast",
      description: "Speak English with confidence — intensive cohort-style learning.",
      primaryHsl: "263 74% 58%", // purple
      ownerId: created["alex@example.com"].id,
    },
  });

  const englishToWork = await prisma.group.upsert({
    where: { slug: "english-to-work" },
    update: {},
    create: {
      communityId: esf.id,
      slug: "english-to-work",
      name: "English to Work",
      description: "Business English for remote professionals.",
      primaryHsl: "263 74% 58%",
      visibility: "PUBLIC",
    },
  });

  const arabicLearners = await prisma.group.upsert({
    where: { slug: "arabic-learners" },
    update: {},
    create: {
      communityId: esf.id,
      slug: "arabic-learners",
      name: "Arabic Learners",
      description: "تعلّم عربي فصيح + عامية مصرية.",
      primaryHsl: "16 85% 55%", // warm orange
      visibility: "PRIVATE",
    },
  });

  // ─── Community 2: Focus Labs (owned by Samir) ───────────────────────────────
  const focusLabs = await prisma.community.upsert({
    where: { slug: "focus-labs" },
    update: {},
    create: {
      slug: "focus-labs",
      name: "Focus Labs",
      description: "Deep-work communities for knowledge workers.",
      primaryHsl: "174 72% 36%", // teal
      ownerId: created["samir@example.com"].id,
    },
  });

  const deepWork = await prisma.group.upsert({
    where: { slug: "deep-work-club" },
    update: {},
    create: {
      communityId: focusLabs.id,
      slug: "deep-work-club",
      name: "Deep Work Club",
      description: "Weekly focus sprints + accountability.",
      primaryHsl: "174 72% 36%",
      visibility: "PUBLIC",
    },
  });

  console.log("⚙️  Seeding memberships…");

  type Seat = { email: string; role: Role; state?: State };

  const seats: Array<{ groupId: string; rows: Seat[] }> = [
    {
      groupId: englishToWork.id,
      rows: [
        { email: "alex@example.com",   role: "OWNER" },
        { email: "mona@example.com",   role: "ADMIN" },
        { email: "layla@example.com",  role: "CONTRIBUTOR" },
        { email: "jordan@example.com", role: "MEMBER" },
        { email: "yara@example.com",   role: "MEMBER" },
        { email: "omar@example.com",   role: "MEMBER" },
        { email: "chris@example.com",  role: "MEMBER", state: "REQUESTED" },
        { email: "nadia@example.com",  role: "MEMBER", state: "BANNED" },
      ],
    },
    {
      groupId: arabicLearners.id,
      rows: [
        { email: "alex@example.com",   role: "OWNER" },
        { email: "hiba@example.com",   role: "ADMIN" },
        { email: "layla@example.com",  role: "CONTRIBUTOR" },
        { email: "yara@example.com",   role: "MEMBER" },
        { email: "nadia@example.com",  role: "MEMBER" },
      ],
    },
    {
      groupId: deepWork.id,
      rows: [
        { email: "samir@example.com",  role: "OWNER" },
        { email: "omar@example.com",   role: "ADMIN" },
        { email: "chris@example.com",  role: "CONTRIBUTOR" },
        { email: "alex@example.com",   role: "MEMBER" },
        { email: "jordan@example.com", role: "MEMBER" },
      ],
    },
  ];

  for (const seat of seats) {
    for (const row of seat.rows) {
      const userId = created[row.email].id;
      await prisma.groupMembership.upsert({
        where: { groupId_userId: { groupId: seat.groupId, userId } },
        update: { role: row.role, state: row.state ?? "ACTIVE" },
        create: {
          groupId: seat.groupId,
          userId,
          role: row.role,
          state: row.state ?? "ACTIVE",
        },
      });
    }
  }

  console.log("⚙️  Seeding channels…");

  type ChannelKind = "PUBLIC" | "PRIVATE" | "ANNOUNCEMENT";
  type ChannelSeed = {
    groupId: string;
    slug: string;
    name: string;
    emoji?: string;
    description?: string;
    kind: ChannelKind;
    position: number;
    privateGrantEmails?: string[];
  };

  const channelSeeds: ChannelSeed[] = [
    // English to Work — 3 channels
    {
      groupId: englishToWork.id,
      slug: "introductions",
      name: "introductions",
      emoji: "👋",
      description: "Say hi and tell us what you do.",
      kind: "PUBLIC",
      position: 0,
    },
    {
      groupId: englishToWork.id,
      slug: "announcements",
      name: "announcements",
      emoji: "📣",
      description: "Important updates from the team.",
      kind: "ANNOUNCEMENT",
      position: 1,
    },
    {
      groupId: englishToWork.id,
      slug: "admins-only",
      name: "admins-only",
      emoji: "🔒",
      description: "Private back-room for admins.",
      kind: "PRIVATE",
      position: 2,
      privateGrantEmails: ["alex@example.com", "mona@example.com"],
    },
    // Arabic Learners — 2 channels
    {
      groupId: arabicLearners.id,
      slug: "عام",
      name: "عام",
      emoji: "💬",
      description: "نقاش عام.",
      kind: "PUBLIC",
      position: 0,
    },
    {
      groupId: arabicLearners.id,
      slug: "قواعد",
      name: "قواعد",
      emoji: "📚",
      description: "كل حاجة عن القواعد.",
      kind: "PUBLIC",
      position: 1,
    },
    // Deep Work Club — 3 channels
    {
      groupId: deepWork.id,
      slug: "sprints",
      name: "sprints",
      emoji: "⏱️",
      description: "Plan and log your weekly focus sprints.",
      kind: "PUBLIC",
      position: 0,
    },
    {
      groupId: deepWork.id,
      slug: "resources",
      name: "resources",
      emoji: "📎",
      description: "Links, tools, and reading.",
      kind: "PUBLIC",
      position: 1,
    },
    {
      groupId: deepWork.id,
      slug: "mentor-room",
      name: "mentor-room",
      emoji: "🎯",
      description: "Private mentor ↔ mentee space.",
      kind: "PRIVATE",
      position: 2,
      privateGrantEmails: ["samir@example.com", "chris@example.com", "omar@example.com"],
    },
  ];

  for (const c of channelSeeds) {
    // Arabic slugs like "عام" won't pass our slug-sanitizer, but Prisma accepts
    // them directly as the unique [groupId, slug] key. Using literal slugs keeps
    // the Arabic URL legible.
    const channel = await prisma.channel.upsert({
      where: { groupId_slug: { groupId: c.groupId, slug: c.slug } },
      update: {
        name: c.name,
        emoji: c.emoji,
        description: c.description,
        kind: c.kind,
        position: c.position,
      },
      create: {
        groupId: c.groupId,
        slug: c.slug,
        name: c.name,
        emoji: c.emoji,
        description: c.description,
        kind: c.kind,
        position: c.position,
      },
    });

    // Private grants before we compute eligibility for the thread backfill.
    if (c.privateGrantEmails?.length) {
      for (const email of c.privateGrantEmails) {
        const userId = created[email]?.id;
        if (!userId) continue;
        await prisma.channelAccess.upsert({
          where: { channelId_userId: { channelId: channel.id, userId } },
          update: {},
          create: { channelId: channel.id, userId },
        });
      }
    }

    await ensureChannelThread(prisma, channel.id);
  }

  console.log("⚙️  Seeding posts…");

  type PostSeed = {
    channelGroupSlug: string;
    channelSlug: string;
    authorEmail: string;
    title?: string;
    body: string;
    pinned?: boolean;
    mediaUrls?: string[];
    ageMinutes: number;
  };

  const postSeeds: PostSeed[] = [
    // English to Work — #introductions
    {
      channelGroupSlug: "english-to-work",
      channelSlug: "introductions",
      authorEmail: "alex@example.com",
      title: "Welcome — start here",
      body:
        "Hey team 👋 — post a short intro with your name, where you're based, and what you're hoping to get out of English to Work. I'll pin this thread.",
      pinned: true,
      ageMinutes: 60 * 24 * 3,
    },
    {
      channelGroupSlug: "english-to-work",
      channelSlug: "introductions",
      authorEmail: "jordan@example.com",
      body: "Jordan from Austin. Been writing English for years but my speaking cadence is a mess on calls. Excited to practice.",
      ageMinutes: 60 * 20,
    },
    {
      channelGroupSlug: "english-to-work",
      channelSlug: "introductions",
      authorEmail: "yara@example.com",
      body: "Yara من القاهرة — مصممة واجهات. بحب أتمرّن على الكتابة الاحترافية بالإنجليزي.",
      ageMinutes: 60 * 6,
    },
    // English to Work — announcements
    {
      channelGroupSlug: "english-to-work",
      channelSlug: "announcements",
      authorEmail: "alex@example.com",
      title: "Weekly office hours: Thursdays 5pm UTC",
      body:
        "Starting this week we'll run open office hours every Thursday at 5pm UTC. Bring a recording of your own voice and we'll give real-time feedback.",
      pinned: true,
      ageMinutes: 60 * 24,
    },
    {
      channelGroupSlug: "english-to-work",
      channelSlug: "announcements",
      authorEmail: "mona@example.com",
      body: "Small reminder: the Members tab now shows presence dots. Green = online in the last 2 minutes.",
      ageMinutes: 60 * 2,
    },
    // Arabic Learners — عام
    {
      channelGroupSlug: "arabic-learners",
      channelSlug: "عام",
      authorEmail: "hiba@example.com",
      title: "الفرق بين الفصحى والعامية",
      body:
        "سؤال شائع: امتى نستخدم الفصحى وامتى العامية؟ باختصار: الفصحى للكتابة الرسمية والأخبار، والعامية للحوار اليومي. المحتوى هنا هيكون بالإتنين حسب الموقف.",
      pinned: true,
      ageMinutes: 60 * 8,
    },
    {
      channelGroupSlug: "arabic-learners",
      channelSlug: "عام",
      authorEmail: "layla@example.com",
      body: "أول بوست! هنشارك هنا نصوص قصيرة كل أسبوع عشان نتدرّب على القراءة السريعة.",
      ageMinutes: 60 * 3,
    },
    {
      channelGroupSlug: "arabic-learners",
      channelSlug: "قواعد",
      authorEmail: "hiba@example.com",
      title: "الإعراب في ٥ دقائق",
      body: "خلي بالك: الإعراب بيفرق المعنى.\n\n- كتبَ محمدٌ درسًا.  (فاعل ← محمد)\n- كتبَ محمدًا درسٌ.  (فاعل ← الدرس!)\n\nتمرين: جرّب تعرب الجملة دي — الولدُ يقرأُ الكتابَ.",
      ageMinutes: 60 * 2,
    },
    // Deep Work Club — sprints
    {
      channelGroupSlug: "deep-work-club",
      channelSlug: "sprints",
      authorEmail: "samir@example.com",
      title: "Sprint 14 kicks off Monday",
      body:
        "Same format as last time: 4x 90-minute blocks, Mon–Thu, 9–11 UTC. Post your goal for the week as a reply to the Monday thread.",
      pinned: true,
      ageMinutes: 60 * 48,
    },
    {
      channelGroupSlug: "deep-work-club",
      channelSlug: "sprints",
      authorEmail: "omar@example.com",
      body: "Signing up. Goal this sprint: finish the migration doc (4k words, currently at 1k).",
      ageMinutes: 60 * 5,
    },
    {
      channelGroupSlug: "deep-work-club",
      channelSlug: "resources",
      authorEmail: "chris@example.com",
      title: "My focus stack",
      body:
        "Sharing what finally worked for me after a year of thrashing:\n\n1. Hard airplane mode, phone in a drawer.\n2. One browser profile per task — no bookmarks bar.\n3. A 25/5 timer but I skip the break if I'm in the zone.\n\nWhat's your non-negotiable?",
      ageMinutes: 60 * 10,
    },
    // Private channels — one post each so PRIVATE visibility can be exercised
    {
      channelGroupSlug: "english-to-work",
      channelSlug: "admins-only",
      authorEmail: "alex@example.com",
      title: "Moderation notes",
      body:
        "Back-room thread for moderation decisions. Drop member IDs + context here before you ban so there's a paper trail.",
      ageMinutes: 60 * 24 * 2,
    },
    {
      channelGroupSlug: "deep-work-club",
      channelSlug: "mentor-room",
      authorEmail: "samir@example.com",
      body: "Scheduling mentor pairings for the next sprint. Drop your top 2 availability windows.",
      ageMinutes: 60 * 12,
    },
  ];

  // Resolve channel ids once — we already seeded all channels above.
  for (const p of postSeeds) {
    const channel = await prisma.channel.findFirst({
      where: {
        slug: p.channelSlug,
        group: { slug: p.channelGroupSlug },
      },
      select: { id: true },
    });
    if (!channel) {
      console.warn(`   ! skipping: no channel ${p.channelGroupSlug}/${p.channelSlug}`);
      continue;
    }
    const author = created[p.authorEmail];
    if (!author) {
      console.warn(`   ! skipping: no user ${p.authorEmail}`);
      continue;
    }

    const createdAt = new Date(Date.now() - p.ageMinutes * 60 * 1000);

    // Seed idempotently by matching on (channelId, authorId, title + first 40 chars).
    const fingerprint = `${channel.id}::${author.id}::${p.title ?? ""}::${p.body.slice(0, 40)}`;
    const existing = await prisma.post.findFirst({
      where: {
        channelId: channel.id,
        authorId: author.id,
        title: p.title ?? null,
        body: { startsWith: p.body.slice(0, 40) },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.post.update({
        where: { id: existing.id },
        data: {
          title: p.title ?? null,
          body: p.body,
          mediaUrls: JSON.stringify(p.mediaUrls ?? []),
          pinned: p.pinned ?? false,
          createdAt,
        },
      });
    } else {
      await prisma.post.create({
        data: {
          channelId: channel.id,
          authorId: author.id,
          title: p.title,
          body: p.body,
          mediaUrls: JSON.stringify(p.mediaUrls ?? []),
          pinned: p.pinned ?? false,
          createdAt,
        },
      });
    }
    void fingerprint;
  }

  console.log(`✅ Done.`);
  console.log(`   Communities: 2`);
  console.log(`   Groups:      3  (english-to-work, arabic-learners, deep-work-club)`);
  console.log(`   Memberships: ${seats.reduce((n, s) => n + s.rows.length, 0)} across 10 users`);
  console.log(`   Channels:    ${channelSeeds.length} with auto-provisioned chat threads`);
  console.log(`   Posts:       ${postSeeds.length} across multiple channels`);
  console.log(`   Log in with any seeded email via the magic-link flow.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
