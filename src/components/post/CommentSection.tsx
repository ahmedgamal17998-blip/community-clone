"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { CommentItem } from "@/components/post/CommentItem";
import { CommentComposer } from "@/components/post/CommentComposer";
import type { CommentWithReplies } from "@/server/comments";

type Props = {
  postId: string;
  comments: CommentWithReplies[];
  viewerId: string;
  viewerCanModerate: boolean;
  commentCount: number;
  groupSlug?: string;
};

export function CommentSection({
  postId,
  comments,
  viewerId,
  viewerCanModerate,
  commentCount,
  groupSlug,
}: Props) {
  const t = useTranslations("comments");
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <MessageCircle className="h-4 w-4" />
        <span>
          {t("count", { count: commentCount })}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {open ? (
        <div className="mt-3 space-y-4">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="space-y-4">
              {comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  viewerId={viewerId}
                  viewerCanModerate={viewerCanModerate}
                  groupSlug={groupSlug}
                />
              ))}
            </div>
          )}

          {/* New comment composer */}
          <div className="pt-1">
            <CommentComposer postId={postId} groupSlug={groupSlug} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
