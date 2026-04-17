"use client";

import { useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCommentAction } from "@/server/comment-actions";

type Props = {
  postId: string;
  parentId?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
};

export function CommentComposer({ postId, parentId, onCancel, onSuccess }: Props) {
  const t = useTranslations("comments");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createCommentAction(formData);
      if (result?.ok) {
        formRef.current?.reset();
        onSuccess?.();
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-2">
      <input type="hidden" name="postId" value={postId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}

      <Textarea
        name="body"
        required
        placeholder={parentId ? t("writeReply") : t("write")}
        rows={2}
        maxLength={2000}
        className="resize-none text-sm"
        disabled={isPending}
      />

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "…" : t("save")}
        </Button>
      </div>
    </form>
  );
}
