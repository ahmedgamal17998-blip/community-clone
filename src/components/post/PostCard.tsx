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
import { RichTextRenderer } from "@/components/editor/RichTextRenderer";
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
        "rounded-xl bg-card",
        "shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]",
        "dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)]",
      )}
    >
      {/* Pinned ribbon */}
      {post.pinned ? (
        <div className="flex items-center gap-1.5 rounded-t-xl border-b border-primary/20 bg-primary/8 px-4 py-2 text-xs font-medium text-primary">
          <Pin className="h-3 w-3" />
          {t("pinned")}
        </div>
      ) : null}

      <div className="p-4">
        {/* Header */}
        <header className="flex items-start gap-3">
          <Link href={`/profile/${post.author.handle}`} className="shrink-0">
            <Avatar className="h-10 w-10">
              {post.author.image ? (
                <AvatarImage src={post.author.image} alt={post.author.name ?? ""} />
              ) : null}
              <AvatarFallback className="text-sm font-semibold">
                {initialsFrom(post.author.name)}
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Link
                href={`/profile/${post.author.handle}`}
                className="text-sm font-bold hover:underline"
              >
                {post.author.name ?? post.author.handle}
              </Link>
              {!hideChannelCrumb ? (
                <Link
                  href={channelHref}
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  #{post.channel.name}
                </Link>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <time
                className="text-xs text-muted-foreground"
                dateTime={post.createdAt.toISOString()}
                title={post.createdAt.toLocaleString()}
              >
                {formatRelative(post.createdAt, locale)}
              </time>
              {post.editedAt ? (
                <span className="text-xs italic text-muted-foreground">
                  · {t("edited")}
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

        {/* Title */}
        {post.title ? (
          <h2 className="mt-3 text-[17px] font-bold leading-snug">{post.title}</h2>
        ) : null}

        {/* Body */}
        <RichTextRenderer content={post.body} className="mt-2 text-sm leading-relaxed" />

        {/* Media grid */}
        {media.length > 0 ? (
          <div
            className={cn(
              "mt-3 grid gap-2 overflow-hidden rounded-xl",
              media.length === 1 ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {media.slice(0, 4).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                className="h-52 w-full object-cover"
                loading="lazy"
              />
            ))}
          </div>
        ) : null}

        {/* Poll */}
        {post.poll ? <PollBlock poll={post.poll} /> : null}

        {/* Reaction summary */}
        {reactions.length > 0 ? (
          <div className="mt-3">
            <ReactionBar
              postId={post.id}
              reactions={reactions}
              viewerId={viewerId}
            />
          </div>
        ) : null}

        {/* Divider */}
        <div className="mt-3 border-t border-border" />

        {/* Action buttons row */}
        <div className="mt-1 flex items-center gap-1">
          {reactions.length === 0 ? (
            <ReactionBar
              postId={post.id}
              reactions={reactions}
              viewerId={viewerId}
            />
          ) : null}
          <CommentSection
            postId={post.id}
            comments={comments}
            viewerId={viewerId}
            viewerCanModerate={viewerCanModerate}
            commentCount={commentCount}
            groupSlug={post.channel.group.slug}
          />
        </div>
      </div>
    </article>
  );
}
