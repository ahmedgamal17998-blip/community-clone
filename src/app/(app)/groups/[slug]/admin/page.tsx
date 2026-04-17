import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { timeAgo } from "@/lib/utils";

export default async function AdminOverviewPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group || !session?.user) notFound();

  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [membersCount, posts7d, adminsCount, pendingCount, recentJoins, recentPosts] =
    await Promise.all([
      db.groupMembership.count({ where: { groupId: group.id, state: "ACTIVE" } }),
      db.post.count({
        where: {
          channel: { groupId: group.id },
          createdAt: { gte: since7d },
        },
      }),
      db.groupMembership.count({
        where: {
          groupId: group.id,
          state: "ACTIVE",
          role: { in: ["OWNER", "ADMIN"] },
        },
      }),
      db.groupMembership.count({
        where: { groupId: group.id, state: "REQUESTED" },
      }),
      db.groupMembership.findMany({
        where: { groupId: group.id, state: "ACTIVE" },
        orderBy: { joinedAt: "desc" },
        take: 20,
        include: {
          user: { select: { id: true, name: true, handle: true, image: true } },
        },
      }),
      db.post.findMany({
        where: { channel: { groupId: group.id } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          author: { select: { id: true, name: true, handle: true } },
          channel: { select: { slug: true, name: true } },
        },
      }),
    ]);

  const tiles = [
    { label: "Active members", value: membersCount },
    { label: "Posts (7d)", value: posts7d },
    { label: "Admins", value: adminsCount },
    { label: "Pending requests", value: pendingCount },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Admin overview</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of activity in this group.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t.label}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3 text-sm font-semibold">
            Recent joins
          </div>
          <ul className="divide-y divide-border">
            {recentJoins.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">No joins yet.</li>
            ) : (
              recentJoins.map((m) => (
                <li key={m.id} className="flex items-center gap-2 p-3 text-sm">
                  <Link
                    href={`/profile/@${m.user.handle}`}
                    className="hover:underline"
                  >
                    {m.user.name ?? `@${m.user.handle}`}
                  </Link>
                  <span className="ms-auto text-xs text-muted-foreground">
                    {timeAgo(m.joinedAt)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3 text-sm font-semibold">
            Recent posts
          </div>
          <ul className="divide-y divide-border">
            {recentPosts.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">No posts yet.</li>
            ) : (
              recentPosts.map((p) => (
                <li key={p.id} className="p-3 text-sm">
                  <Link
                    href={`/groups/${group.slug}/channels/${p.channel.slug}#post-${p.id}`}
                    className="line-clamp-1 hover:underline"
                  >
                    {p.title ?? p.body.slice(0, 80)}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>@{p.author.handle}</span>
                    <span>·</span>
                    <span>#{p.channel.name}</span>
                    <span>·</span>
                    <span>{timeAgo(p.createdAt)}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
