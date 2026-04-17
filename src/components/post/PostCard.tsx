import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Pin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { decodeMedia } from "@/server/posts";
import { formatRelative } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { PostActionsMenu } from "@/components/post/PostActionsMenu";
import { ReactionBar } from "@/components/post/ReactionBar";
import { CommentSection } from "@/components/post/CommentSection";
import { PollBlock } from "@/components/post/PollBlock";
import { getPostComments } from "@/server/comments";
import type { ReactionSummary } from "@/server/comments";
import type { PollData } from "@/server/posts";

type PostCardPost = {
  id: string;
  title: string | null;
  body: string;
  mediaUrls: string;
  pinned: boolean;
  createdAt: Date;
  editedAt: Date | null;
  authorId: string;
  author: {
    id: string;
    name: string | null;
    handle: string;
    image: string | null;
  };
  channel: {
    id: string;
    slug: string;
    name: string;
    kind: string;
    group: { slug: string };
  };
  // M5 engagement fields.
  commentCount?: number;
  reactions?: ReactionSummary[];
  poll?: PollData | null;
};

type Props = {
  post: PostCardPost;
  viewerId: string;
  viewerCanModerate: boolean;
  /** When rendered inside a single-channel feed, hide the "in #channel" crumb. */
  hideChannelCrumb?: boolean;
};

export async function PostCard({ post, viewerId, viewerCanModerate, hideChannelCrumb }: Props) {
  const locale = await getLocale();
  const t = await getTranslations("posts.card");
  const media = decodeMedia(post.mediaUrls);

  const canManage = viewerCanModerate || post.authorId === viewerId;
  const channelHref = `/groups/${post.channel.group.slug}/channels/${post.channel.slug}`;

  // Load comments server-side so CommentSection gets hydrated data.
  const comments = await getPostComments(post.id, viewerId);
  const commentCount = post.commentCount ?? comments.reduce((n, c) => n + 1 + c.replies.length, 0);
  const reactions = post.reactions ?? [];

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4",
        post.pinned ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <header className="flex items-start gap-3">
        <Link href={`/profile/${post.author.handle}`} className="shrink-0">
          <Avatar>
            {post.author.image ? (
              <AvatarImage src={post.author.image} alt={post.author.name ?? ""} />
            ) : null}
            <AvatarFallback>{initialsFrom(post.author.name)}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <Link
              href={`/profile/${post.author.handle}`}
              className="font-semibold hover:underline"
            >
              {post.author.name ?? post.author.handle}
            </Link>
            <span className="text-muted-foreground">@{post.author.handle}</span>
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            <time
              className="text-muted-foreground"
              dateTime={post.createdAt.toISOString()}
              title={post.createdAt.toLocaleString()}
            >
              {formatRelative(post.createdAt, locale)}
            </time>
            {!hideChannelCrumb ? (
              <>
                <span className="text-muted-foreground" aria-hidden>
                  ·
                </span>
                <Link
                  href={channelHref}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t("inChannel", { channel: post.channel.name })}
                </Link>
              </>
            ) : null}
            {post.editedAt ? (
              <span className="text-xs italic text-muted-foreground">
                ({t("edited")})
              </span>
            ) : null}
            {post.pinned ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Pin className="h-3 w-3" />
                {t("pinned")}
              </span>
            ) : null}
          </div>
        </div>

        {canManage ? (
          <PostActionsMenu
            postId={post.id}
            pinned={post.pinned}
            canPin={viewerCanModerate}
            canDelete={canManage}
          />
        ) : null}
      </header>

      {post.title ? (
        <h2 className="mt-3 text-lg font-semibold leading-snug">{post.title}</h2>
      ) : null}

      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {post.body}
      </div>

      {media.length > 0 ? (
        <div
          className={cn(
            "mt-3 grid gap-2",
            media.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {media.slice(0, 4).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url}-${i}`}
              src={url}
              alt=""
              className="h-48 w-full rounded-lg object-cover"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      {/* Poll */}
      {post.poll ? <PollBlock poll={post.poll} /> : null}

      {/* Reactions */}
      <div className="mt-3">
        <ReactionBar
          postId={post.id}
          reactions={reactions}
          viewerId={viewerId}
        />
      </div>

      {/* Comments */}
      <CommentSection
        postId={post.id}
        comments={comments}
        viewerId={viewerId}
        viewerCanModerate={viewerCanModerate}
        commentCount={commentCount}
      />
    </article>
  );
}
