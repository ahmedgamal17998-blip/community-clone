"use client";

import { useState } from "react";
import { MoreHorizontal, Pin, PinOff, Trash2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { deletePostAction, togglePinAction } from "@/server/post-actions";
import { EditPostSheet } from "@/components/post/EditPostSheet";
import type { MediaPayload } from "@/server/posts";

type Props = {
  postId: string;
  pinned: boolean;
  canPin: boolean;
  canDelete: boolean;
  canEdit: boolean;
  initialTitle: string | null;
  initialBody: string;
  initialMedia: MediaPayload;
  groupSlug: string;
};

export function PostActionsMenu({
  postId,
  pinned,
  canPin,
  canDelete,
  canEdit,
  initialTitle,
  initialBody,
  initialMedia,
  groupSlug,
}: Props) {
  const t = useTranslations("posts.menu");
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("open")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem
              onClick={() => setEditOpen(true)}
              className="cursor-pointer"
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t("edit")}
            </DropdownMenuItem>
          )}
          {canEdit && (canPin || canDelete) ? <DropdownMenuSeparator /> : null}
          {canPin ? (
            <form action={togglePinAction}>
              <input type="hidden" name="postId" value={postId} />
              <input type="hidden" name="pinned" value={pinned ? "0" : "1"} />
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  {pinned ? (
                    <>
                      <PinOff className="mr-2 h-4 w-4" />
                      {t("unpin")}
                    </>
                  ) : (
                    <>
                      <Pin className="mr-2 h-4 w-4" />
                      {t("pin")}
                    </>
                  )}
                </button>
              </DropdownMenuItem>
            </form>
          ) : null}
          {canPin && canDelete ? <DropdownMenuSeparator /> : null}
          {canDelete ? (
            <form action={deletePostAction}>
              <input type="hidden" name="postId" value={postId} />
              <DropdownMenuItem asChild>
                <button
                  type="submit"
                  className="w-full text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("delete")}
                </button>
              </DropdownMenuItem>
            </form>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <EditPostSheet
          postId={postId}
          initialTitle={initialTitle}
          initialBody={initialBody}
          initialMedia={initialMedia}
          groupSlug={groupSlug}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
