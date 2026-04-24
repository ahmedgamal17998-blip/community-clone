"use client";

/**
 * Post composer. M4a: plain textarea + optional list of image URLs.
 * M5: adds optional poll (question + up to 5 options).
 * M14: switched to TipTap RichTextEditor.
 */
import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPostAction } from "@/server/post-actions";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/editor/RichTextEditor";

type State = { ok: boolean; error?: string; postId?: string } | null;

type Props = {
  channelId: string;
  /** Compact mode collapses the composer to a single-line trigger until focused. */
  compact?: boolean;
  /** When provided, the body textarea enables @mention autocomplete. */
  groupSlug?: string;
};

const MAX_POLL_OPTIONS = 5;

export function Composer({ channelId, compact = true, groupSlug }: Props) {
  const t = useTranslations("posts.composer");
  const tc = useTranslations("composer");
  const [expanded, setExpanded] = useState(!compact);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [body, setBody] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction] = useFormState<State, FormData>(
    async (prev, formData) => {
      const result = await createPostAction(prev, formData);
      if (result?.ok) {
        formRef.current?.reset();
        setMediaOpen(false);
        setPollOpen(false);
        setPollOptions(["", ""]);
        setBody("");
      }
      return result ?? prev;
    },
    null,
  );

  function addPollOption() {
    if (pollOptions.length < MAX_POLL_OPTIONS) {
      setPollOptions((prev) => [...prev, ""]);
    }
  }

  function removePollOption(idx: number) {
    setPollOptions((prev) => prev.filter((_, i) => i !== idx));
  }

  function updatePollOption(idx: number, value: string) {
    setPollOptions((prev) => prev.map((v, i) => (i === idx ? value : v)));
  }

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

      {/* Hidden input carries the JSON body for form submission */}
      <input type="hidden" name="body" value={body} />
      <RichTextEditor
        value={body}
        onChange={(json) => setBody(json)}
        placeholder={t("bodyPlaceholder")}
        groupSlug={groupSlug}
        maxLength={50_000}
        minHeight={120}
        className="border-0 bg-transparent shadow-none focus-within:ring-0"
      />

      {/* Media section */}
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

      {/* Poll section */}
      {pollOpen ? (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{tc("pollQuestion")}</span>
            <button
              type="button"
              onClick={() => {
                setPollOpen(false);
                setPollOptions(["", ""]);
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={tc("removePoll")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Input
            name="pollQuestion"
            placeholder={tc("pollQuestionPlaceholder")}
            maxLength={500}
            className="text-sm"
          />

          {pollOptions.map((val, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={val}
                onChange={(e) => updatePollOption(idx, e.target.value)}
                placeholder={tc("pollOptionPlaceholder")}
                maxLength={200}
                className="text-sm"
              />
              {/* Pass values via hidden inputs for form submission */}
              <input type="hidden" name={`pollOptionItem`} value={val} />
              {pollOptions.length > 2 ? (
                <button
                  type="button"
                  onClick={() => removePollOption(idx)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Remove option"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}

          {pollOptions.length < MAX_POLL_OPTIONS ? (
            <button
              type="button"
              onClick={addPollOption}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {tc("addOption")}
            </button>
          ) : null}

          {/* Hidden textarea to submit all options as newline-separated */}
          <textarea
            name="pollOptions"
            className="sr-only"
            readOnly
            value={pollOptions.join("\n")}
            aria-hidden
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pollMultipleChoice"
              value="1"
              className="rounded"
            />
            {tc("multipleChoice")}
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="pollOptions" value="" />
        </>
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
          <button
            type="button"
            onClick={() => setPollOpen((v) => !v)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              pollOpen
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {pollOpen ? tc("removePoll") : tc("addPoll")}
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
                setPollOpen(false);
                setPollOptions(["", ""]);
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
