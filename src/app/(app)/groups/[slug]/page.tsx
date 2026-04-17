import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { listGroupFeed, buildPostReactions, buildPollData } from "@/server/posts";
import { PostCard } from "@/components/post/PostCard";
import { FeedClient } from "@/components/post/FeedClient";

// Discussion tab — group feed across every channel the viewer can see.
export default async function GroupDiscussionPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("groups");
  const tPosts = await getTranslations("posts");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!group) notFound();

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: group.id, userId: session.user.id },
    },
    select: { role: true, state: true },
  });
  const isActive = membership?.state === "ACTIVE";
  const canModerate = isActive
    ? hasMinRole(membership!.role as Role, "ADMIN")
    : false;

  if (!isActive) {
    // Non-members see the empty placeholder only.
    return (
      <section className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
        <h2 className="text-base font-semibold">{t("empty.discussionTitle")}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {tPosts("nonMember")}
        </p>
      </section>
    );
  }

  const viewerId = session.user.id;
  const feed = await listGroupFeed({ groupId: group.id, userId: viewerId });

  const isEmpty = feed.pinned.length === 0 && feed.items.length === 0;

  return (
    <div className="space-y-4">
      {isEmpty ? (
        <section className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <h2 className="text-base font-semibold">{tPosts("empty.groupTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {tPosts("empty.groupBody")}
          </p>
        </section>
      ) : (
        <>
          {feed.pinned.map((p) => (
            <PostCard
              key={p.id}
              post={{
                ...p,
                commentCount: p._count.comments,
                reactions: buildPostReactions(p.reactions, viewerId),
                poll: buildPollData(p.poll),
              }}
              viewerId={viewerId}
              viewerCanModerate={canModerate}
            />
          ))}
          {feed.items.map((p) => (
            <PostCard
              key={p.id}
              post={{
                ...p,
                commentCount: p._count.comments,
                reactions: buildPostReactions(p.reactions, viewerId),
                poll: buildPollData(p.poll),
              }}
              viewerId={viewerId}
              viewerCanModerate={canModerate}
            />
          ))}
          <FeedClient
            scope={{ groupId: group.id }}
            initialCursor={feed.nextCursor}
            viewerId={viewerId}
          />
        </>
      )}
    </div>
  );
}
