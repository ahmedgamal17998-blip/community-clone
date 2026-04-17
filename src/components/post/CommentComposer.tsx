"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCommentAction } from "@/server/comment-actions";
import { VoiceRecorder } from "@/components/post/VoiceRecorder";

type Props = {
  postId: string;
  parentId?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
};

export function CommentComposer({ postId, parentId, onCancel, onSuccess }: Props) {
  const t = useTranslations("comments");
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [body, setBody] = useState("");
  const [audio, setAudio] = useState<{ blob: Blob; duration: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const hasBody = body.trim().length > 0;
  const canSubmit = !isPending && !isUploading && (hasBody || audio !== null);

  function resetAll() {
    setBody("");
    setAudio(null);
    setError(null);
    formRef.current?.reset();
  }

  async function handleSubmit(formData: FormData) {
    setError(null);

    if (!hasBody && !audio) {
      setError("Write something or record a voice note");
      return;
    }

    try {
      if (audio) {
        setIsUploading(true);
        const uploadForm = new FormData();
        uploadForm.append("file", audio.blob, "voice-note.webm");
        const res = await fetch("/api/comment-audio/upload", {
          method: "POST",
          body: uploadForm,
        });
        setIsUploading(false);
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(data?.error ?? "Upload failed");
          return;
        }
        const { url } = (await res.json()) as { url: string };
        formData.set("audioUrl", url);
        formData.set("audioDurationSec", String(audio.duration));
      }

      // Ensure body field reflects our controlled state (may be empty)
      formData.set("body", body);

      startTransition(async () => {
        const result = await createCommentAction(formData);
        if (result?.ok) {
          resetAll();
          onSuccess?.();
        } else if (result && !result.ok) {
          setError(result.error);
        }
      });
    } catch (e) {
      setIsUploading(false);
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const disabled = isPending || isUploading;

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-2">
      <input type="hidden" name="postId" value={postId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}

      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? t("writeReply") : t("write")}
        rows={2}
        maxLength={2000}
        className="resize-none text-sm"
        disabled={disabled}
      />

      <div className="flex items-center justify-between gap-2">
        <VoiceRecorder
          onRecorded={(blob, duration) => setAudio({ blob, duration })}
          onClear={() => setAudio(null)}
          disabled={disabled}
        />

        <div className="flex items-center gap-2">
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={disabled}
            >
              {t("cancel")}
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {isPending || isUploading ? "…" : t("save")}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </form>
  );
}
