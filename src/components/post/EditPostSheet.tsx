"use client";

import { useState, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { MediaUploader, type UploadedMedia } from "@/components/post/MediaUploader";
import { editPostAction } from "@/server/post-actions";
import type { MediaPayload } from "@/server/posts";

type Props = {
  postId: string;
  initialTitle: string | null;
  initialBody: string;
  initialMedia: MediaPayload;
  groupSlug: string;
  onClose: () => void;
};

type State = { ok: boolean; error?: string } | null;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function EditPostSheet({
  postId,
  initialTitle,
  initialBody,
  initialMedia,
  groupSlug,
  onClose,
}: Props) {
  const [body, setBody] = useState(initialBody);
  const [uploaded, setUploaded] = useState<UploadedMedia>({
    images: initialMedia.images,
    videos: initialMedia.videos,
    files: initialMedia.files,
  });
  const [embeds, setEmbeds] = useState<string[]>(initialMedia.embeds);
  const [embedInput, setEmbedInput] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction] = useFormState<State, FormData>(
    async (prev, fd) => {
      const result = await editPostAction(prev, fd);
      if (result?.ok) onClose();
      return result ?? prev;
    },
    null,
  );

  function addEmbed() {
    const url = embedInput.trim();
    if (url && !embeds.includes(url)) setEmbeds((e) => [...e, url]);
    setEmbedInput("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">Edit post</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form ref={formRef} action={formAction} className="space-y-4">
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="body" value={body} />
          <input type="hidden" name="uploadedImageUrls" value={JSON.stringify(uploaded.images)} />
          <input type="hidden" name="uploadedVideoUrls" value={JSON.stringify(uploaded.videos)} />
          <input type="hidden" name="uploadedFileData" value={JSON.stringify(uploaded.files)} />
          <input type="hidden" name="videoEmbeds" value={JSON.stringify(embeds)} />

          <Input
            name="title"
            defaultValue={initialTitle ?? ""}
            placeholder="Title (optional)"
            maxLength={160}
            className="border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />

          <RichTextEditor
            value={body}
            onChange={(json) => setBody(json)}
            placeholder="What's on your mind?"
            groupSlug={groupSlug}
            maxLength={50_000}
            minHeight={120}
            className="border-0 bg-transparent shadow-none focus-within:ring-0"
          />

          {/* Media uploads */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Media from device</p>
            <MediaUploader value={uploaded} onChange={setUploaded} maxImages={4} />
          </div>

          {/* External image URL textarea */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Image URLs (one per line)</p>
            <Textarea
              name="mediaUrls"
              rows={2}
              defaultValue={initialMedia.images
                .filter((u) => !uploaded.images.includes(u))
                .join("\n")}
              placeholder="https://example.com/photo.jpg"
              className="text-xs"
            />
          </div>

          {/* Video embed links */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Video links (YouTube, Vimeo, Loom)
            </p>
            <div className="flex gap-2">
              <Input
                value={embedInput}
                onChange={(e) => setEmbedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addEmbed(); }
                }}
                placeholder="https://youtube.com/watch?v=..."
                className="text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={addEmbed}>
                Add
              </Button>
            </div>
            {embeds.map((url, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                <span className="flex-1 truncate text-muted-foreground">{url}</span>
                <button
                  type="button"
                  onClick={() => setEmbeds((e) => e.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {state?.ok === false && state.error && (
            <p className="text-sm text-destructive" role="alert">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SaveButton />
          </div>
        </form>
      </div>
    </div>
  );
}
