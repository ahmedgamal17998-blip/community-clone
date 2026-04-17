"use client";

/**
 * Post composer. M4a: plain textarea + optional list of image URLs
 * (one per line). M4b will swap the textarea for TipTap and add direct-to-blob
 * image upload.
 */
import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPostAction } from "@/server/post-actions";
import { cn } from "@/lib/utils";

type State = { ok: boolean; error?: string; postId?: string } | null;

type Props = {
  channelId: string;
  /** Compact mode collapses the composer to a single-line trigger until focused. */
  compact?: boolean;
};

export function Composer({ channelId, compact = true }: Props) {
  const t = useTranslations("posts.composer");
  const [expanded, setExpanded] = useState(!compact);
  const [mediaOpen, setMediaOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction] = useFormState<State, FormData>(
    async (prev, formData) => {
      const result = await createPostAction(prev, formData);
      if (result?.ok) {
        formRef.current?.reset();
        setMediaOpen(false);
      }
      return result ?? prev;
    },
    null,
  );

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-card"
      >
        {t("placeholder")}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="channelId" value={channelId} />

      <Input
        name="title"
        placeholder={t("titlePlaceholder")}
        maxLength={160}
        className="border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
      />

      <Textarea
        name="body"
        required
        placeholder={t("bodyPlaceholder")}
        rows={4}
        maxLength={10_000}
        className="resize-y border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      />

      {mediaOpen ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("mediaLabel")}
          </label>
          <Textarea
            name="mediaUrls"
            rows={2}
            placeholder={t("mediaPlaceholder")}
            className="text-xs"
          />
        </div>
      ) : (
        <input type="hidden" name="mediaUrls" value="" />
      )}

      {state && state.ok === false && state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMediaOpen((v) => !v)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              mediaOpen
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t("addMedia")}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {compact ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                formRef.current?.reset();
                setMediaOpen(false);
                setExpanded(false);
              }}
            >
              {t("cancel")}
            </Button>
          ) : null}
          <SubmitButton idle={t("publish")} busy={t("publishing")} />
        </div>
      </div>
    </form>
  );
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}
