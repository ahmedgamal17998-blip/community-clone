"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { initialsFrom } from "@/lib/initials";
import { formatRelative } from "@/lib/relative-time";
import { deleteCommentAction, editCommentAction } from "@/server/comment-actions";
import { ReactionBar } from "@/components/post/ReactionBar";
import { CommentComposer } from "@/components/post/CommentComposer";
import { RichTextRenderer } from "@/components/editor/RichTextRenderer";
import type { CommentItem as CommentItemType, CommentWithReplies } from "@/server/comments";

type Props = {
  comment: CommentWithReplies | CommentItemType;
  viewerId: string;
  viewerCanModerate: boolean;
  /** If true, don't render the reply button (used for reply-level items). */
  isReply?: boolean;
  groupSlug?: string;
};

export function CommentItem({ comment, viewerId, viewerCanModerate, isReply = false, groupSlug }: Props) {
  const t = useTranslations("comments");
  const locale = useLocale();
  const [editMode, setEditMode] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [isSaving, startSave] = useTransition();
  const editRef = useRef<HTMLFormElement>(null);

  const canEdit = comment.authorId === viewerId;
  const canDelete = comment.authorId === viewerId || viewerCanModerate;
  const hasReplies = "replies" in comment && comment.replies.length > 0;

  function handleDelete() {
    const fd = new FormData();
    fd.set("commentId", comment.id);
    startDelete(async () => {
      await deleteCommentAction(fd);
    });
  }

  function handleSaveEdit(formData: FormData) {
    startSave(async () => {
      const result = await editCommentAction(formData);
      if (result?.ok) setEditMode(false);
    });
  }

  return (
    <div className={isDeleting ? "opacity-50 pointer-events-none" : ""}>
      <div className="flex gap-2.5">
        <Link href={`/profile/${comment.author.handle}`} className="shrink-0 mt-0.5">
          <Avatar className="h-7 w-7">
            {comment.author.image ? (
              <AvatarImage src={comment.author.image} alt={comment.author.name ?? ""} />
            ) : null}
            <AvatarFallback className="text-xs">{initialsFrom(comment.author.name)}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1 space-y-1">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-xs">
            <Link
              href={`/profile/${comment.author.handle}`}
              className="font-semibold hover:underline"
            >
              {comment.author.name ?? comment.author.handle}
            </Link>
            <span className="text-muted-foreground">@{comment.author.handle}</span>
            <span className="text-muted-foreground" aria-hidden>·</span>
            <time
              className="text-muted-foreground"
              dateTime={comment.createdAt.toISOString()}
            >
              {formatRelative(comment.createdAt, locale)}
            </time>
            {comment.editedAt ? (
              <span className="italic text-muted-foreground">({t("edited")})</span>
            ) : null}
          </div>

          {/* Body or edit form */}
          {editMode ? (
            <form ref={editRef} action={handleSaveEdit} className="space-y-1.5">
              <input type="hidden" name="commentId" value={comment.id} />
              <Textarea
                name="body"
                defaultValue={comment.body ?? ""}
                required
                rows={2}
                maxLength={2000}
                className="resize-none text-sm"
                disabled={isSaving}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={isSaving}>
                  {isSaving ? "…" : t("save")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditMode(false)}
                  disabled={isSaving}
                >
                  {t("cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <>
              {comment.body ? (
                <RichTextRenderer
                  content={comment.body}
                  className="text-sm leading-relaxed"
                />
              ) : null}
              {comment.audioUrl ? (
                <audio
                  controls
                  src={comment.audioUrl}
                  className="mt-1 w-full max-w-sm"
                />
              ) : null}
            </>
          )}

          {/* Reactions + actions */}
          {!editMode ? (
            <div className="flex flex-wrap items-center gap-3">
              <ReactionBar
                commentId={comment.id}
                reactions={comment.reactions}
                viewerId={viewerId}
              />
              {!isReply ? (
                <button
                  type="button"
                  onClick={() => setReplyOpen((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("reply")}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Reply composer */}
          {replyOpen && !isReply ? (
            <div className="mt-2">
              <CommentComposer
                postId={comment.postId}
                parentId={comment.id}
                onCancel={() => setReplyOpen(false)}
                onSuccess={() => setReplyOpen(false)}
                groupSlug={groupSlug}
              />
            </div>
          ) : null}

          {/* Nested replies */}
          {hasReplies ? (
            <div className="mt-2 space-y-3 border-l-2 border-border pl-3">
              {(comment as CommentWithReplies).replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={{ ...reply, replies: [] } as CommentWithReplies}
                  viewerId={viewerId}
                  viewerCanModerate={viewerCanModerate}
                  isReply
                  groupSlug={groupSlug}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* Actions menu */}
        {(canEdit || canDelete) && !editMode ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Comment actions"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit ? (
                <DropdownMenuItem
                  onSelect={() => setEditMode(true)}
                  className="gap-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("edit")}
                </DropdownMenuItem>
              ) : null}
              {canEdit && canDelete ? <DropdownMenuSeparator /> : null}
              {canDelete ? (
                <DropdownMenuItem
                  onSelect={handleDelete}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("delete")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
