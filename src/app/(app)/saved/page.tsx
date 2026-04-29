import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { buildPostReactions, buildPollData } from "@/server/posts";
import { PostCard } from "@/components/post/PostCard";

export const dynamic = "force-dynamic";

export default async function SavedPostsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const viewerId = session.user.id;

  // Fetch every post the viewer has saved (newest save first), with all
  // the relations PostCard needs.
  const saves = await db.savedPost.findMany({
    where: { userId: viewerId },
    orderBy: { savedAt: "desc" },
    take: 100,
    include: {
      post: {
        include: {
          author: { select: { id: true, name: true, handle: true, image: true } },
          channel: {
            select: {
              id: true,
              slug: true,
              name: true,
              kind: true,
              groupId: true,
              group: { select: { slug: true } },
            },
          },
          reactions: { select: { emoji: true, authorId: true } },
          poll: {
            include: {
              options: {
                include: {
                  _count: { select: { votes: true } },
                  votes: {
                    where: { userId: viewerId },
                    select: { optionId: true },
                  },
                },
              },
            },
          },
          _count: { select: { comments: true } },
        },
      },
    },
  });

  // Filter out saves whose underlying post was deleted (defensive).
  const visible = saves.filter((s) => s.post != null);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Bookmark className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Saved posts</h1>
          <p className="text-xs text-muted-foreground">
            {visible.length} saved · only visible to you
          </p>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <Bookmark className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">Nothing saved yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Tap the <span className="font-semibold">Save</span> button under any post to bookmark it for later.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((s) => (
            <PostCard
              key={s.post.id}
              post={{
                ...s.post,
                commentCount: s.post._count.comments,
                reactions: buildPostReactions(s.post.reactions, viewerId),
                poll: buildPollData(s.post.poll),
                savedByViewer: true,
              }}
              viewerId={viewerId}
              viewerCanModerate={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}
