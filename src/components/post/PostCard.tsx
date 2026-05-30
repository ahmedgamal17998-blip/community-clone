import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Pin, FileText, Download } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { decodeMedia } from "@/server/posts";
import { formatRelative } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { PostActionsMenu } from "@/components/post/PostActionsMenu";
import { VideoEmbed } from "@/components/post/VideoEmbed";
import { PostEngagementArea } from "@/components/post/PostEngagementArea";
import { PollBlock } from "@/components/post/PollBlock";
import { RichTextRenderer } from "@/components/editor/RichTextRenderer";
import { getPostComments } from "@/server/comments";
import { db } from "@/server/db";
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
  /** Whether the viewer has saved this post (passed from server). */
  savedByViewer?: boolean;
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

  // savedByViewer can be passed in by feed pages that pre-batch SavedPost
  // rows; fall back to a per-card lookup so the bookmark state is accurate
  // even on standalone renders.
  const savedByViewer =
    typeof post.savedByViewer === "boolean"
      ? post.savedByViewer
      : !!(await db.savedPost.findUnique({
          where: { userId_postId: { userId: viewerId, postId: post.id } },
          select: { id: true },
        }));

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
              canEdit={canManage}
              initialTitle={post.title}
              initialBody={post.body}
              initialMedia={media}
              groupSlug={post.channel.group.slug}
            />
          ) : null}
        </header>

        {/* Title */}
        {post.title ? (
          <h2 className="mt-3 text-[17px] font-bold leading-snug">{post.title}</h2>
        ) : null}

        {/* Body */}
        <RichTextRenderer content={post.body} className="mt-2 text-sm leading-relaxed" />

        {/* Image grid */}
        {media.images.length > 0 ? (
          <div
            className={cn(
              "mt-3 grid gap-2 overflow-hidden rounded-xl",
              media.images.length === 1 ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {media.images.slice(0, 4).map((url, i) => (
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

        {/* Uploaded videos */}
        {media.videos.map((url, i) => (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video key={i} src={url} controls className="mt-3 w-full rounded-xl" />
        ))}

        {/* File attachments */}
        {media.files.map((f, i) => (
          <a
            key={i}
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{f.name}</span>
            <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </a>
        ))}

        {/* Video embeds (YouTube, Vimeo, Loom) */}
        {media.embeds.map((url, i) => (
          <VideoEmbed key={i} url={url} />
        ))}

        {/* Poll */}
        {post.poll ? <PollBlock poll={post.poll} /> : null}

        {/* Engagement area: reactions summary + action row (Like/Comment/Share/Save) + comments */}
        <PostEngagementArea
          postId={post.id}
          reactions={reactions}
          viewerId={viewerId}
          commentCount={commentCount}
          comments={comments}
          viewerCanModerate={viewerCanModerate}
          groupSlug={post.channel.group.slug}
          savedByViewer={savedByViewer}
        />
      </div>
    </article>
  );
}
