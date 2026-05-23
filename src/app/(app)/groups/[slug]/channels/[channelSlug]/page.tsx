import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { hasCapability } from "@/server/capabilities";
import { listChannelPosts, buildPostReactions, buildPollData } from "@/server/posts";
import { PostCard } from "@/components/post/PostCard";
import { FeedClient } from "@/components/post/FeedClient";
import { Composer } from "@/components/post/Composer";

// Channel Posts tab — single-channel feed + composer.
export default async function ChannelPostsPage({
  params,
}: {
  params: { slug: string; channelSlug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const tPosts = await getTranslations("posts");

  const channel = await db.channel.findFirst({
    where: { slug: params.channelSlug, group: { slug: params.slug } },
    select: { id: true, kind: true, groupId: true },
  });
  if (!channel) notFound();

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: channel.groupId, userId: session.user.id },
    },
    select: { role: true, state: true },
  });
  if (!membership || membership.state !== "ACTIVE") redirect(`/groups/${params.slug}`);

  const isAdmin = hasMinRole(membership.role as Role, "ADMIN");

  // Announcement channels: only ADMIN+ sees the composer. Everyone else
  // can still read.
  const canPost = channel.kind === "ANNOUNCEMENT" ? isAdmin : true;

  const viewerId = session.user.id;
  const feed = await listChannelPosts({ channelId: channel.id, viewerId });
  const isEmpty = feed.pinned.length === 0 && feed.items.length === 0;

  // Cross-post: admins/owners with CROSSPOST capability get a channel picker.
  // Owner always passes; admins gated by capability.
  const canCrossPost = isAdmin
    ? await hasCapability({
        userId: session.user.id,
        groupId: channel.groupId,
        capability: "CROSSPOST",
      })
    : false;

  const groupChannels = canCrossPost
    ? await db.channel.findMany({
        where: { groupId: channel.groupId, archived: false },
        orderBy: { position: "asc" },
        select: { id: true, slug: true, name: true, kind: true },
      })
    : [];

  return (
    <div className="space-y-4">
      {canPost ? (
        <Composer
          channelId={channel.id}
          groupSlug={params.slug}
          crossPostChannels={canCrossPost ? groupChannels : undefined}
        />
      ) : null}

      {isEmpty ? (
        <section className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <h2 className="text-base font-semibold">{tPosts("empty.channelTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {tPosts("empty.channelBody")}
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
              viewerCanModerate={isAdmin}
              hideChannelCrumb
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
              viewerCanModerate={isAdmin}
              hideChannelCrumb
            />
          ))}
          <FeedClient
            scope={{ channelId: channel.id }}
            initialCursor={feed.nextCursor}
            hideChannelCrumb
            viewerId={viewerId}
          />
        </>
      )}
    </div>
  );
}
