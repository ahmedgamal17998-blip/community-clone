"use client";

/**
 * Post composer. M4a: plain textarea + optional list of image URLs.
 * M5: adds optional poll (question + up to 5 options).
 * M14: switched to TipTap RichTextEditor.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Plus, ChevronDown, Hash, Megaphone, Lock as LockIcon, Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPostAction } from "@/server/post-actions";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { ImageUploader } from "@/components/post/ImageUploader";

type State = { ok: boolean; error?: string; postId?: string } | null;

type CrossPostChannel = {
  id: string;
  slug: string;
  name: string;
  kind: string; // PUBLIC | PRIVATE | ANNOUNCEMENT
};

type Props = {
  channelId: string;
  /** Compact mode collapses the composer to a single-line trigger until focused. */
  compact?: boolean;
  /** When provided, the body textarea enables @mention autocomplete. */
  groupSlug?: string;
  /**
   * Admin-only cross-post: when supplied, the composer renders a channel
   * picker and lets the admin post to multiple channels in one go.
   * Pass the full list of channels in the group; the current `channelId`
   * is auto-selected by default.
   */
  crossPostChannels?: CrossPostChannel[];
};

const MAX_POLL_OPTIONS = 5;

function ChannelKindIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === "PRIVATE") return <LockIcon className={className} />;
  if (kind === "ANNOUNCEMENT") return <Megaphone className={className} />;
  return <Hash className={className} />;
}

export function Composer({ channelId, compact = true, groupSlug, crossPostChannels }: Props) {
  const t = useTranslations("posts.composer");
  const tc = useTranslations("composer");
  const [expanded, setExpanded] = useState(!compact);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [body, setBody] = useState("");
  // M24: device image uploads
  const [images, setImages] = useState<string[]>([]);
  const [justPosted, setJustPosted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // ── Cross-post (admin only) ────────────────────────────────────────────
  const canCrossPost = !!crossPostChannels && crossPostChannels.length > 1;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    () => new Set([channelId]),
  );
  const channelById = useMemo(() => {
    const m = new Map<string, CrossPostChannel>();
    (crossPostChannels ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [crossPostChannels]);

  function toggleChannel(id: string) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't allow removing the last channel — must post somewhere.
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const [state, formAction] = useFormState<State, FormData>(
    async (prev, formData) => {
      const result = await createPostAction(prev, formData);
      if (result?.ok) {
        formRef.current?.reset();
        setMediaOpen(false);
        setPollOpen(false);
        setPollOptions(["", ""]);
        setBody("");
        setImages([]);
        // Reset cross-post selection back to just the current channel.
        setSelectedChannels(new Set([channelId]));
        setPickerOpen(false);
        // Collapse immediately + flash "Posted ✓" on the compact pill.
        if (compact) setExpanded(false);
        setJustPosted(true);
      }
      return result ?? prev;
    },
    null,
  );

  // Clear the "Posted ✓" flash after 1.5s.
  useEffect(() => {
    if (!justPosted) return;
    const t = setTimeout(() => setJustPosted(false), 1500);
    return () => clearTimeout(t);
  }, [justPosted]);

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
        data-tour="composer"
        onClick={() => setExpanded(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors",
          justPosted
            ? "border-green-500/50 text-green-700 dark:text-green-400"
            : "border-border text-muted-foreground hover:border-primary hover:bg-card",
        )}
        disabled={justPosted}
      >
        {justPosted ? (
          <>
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-semibold">Posted</span>
          </>
        ) : (
          t("placeholder")
        )}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      data-tour="composer"
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="channelId" value={channelId} />
      {/* When admin selects multiple channels, the server treats `channelIds`
          as the source of truth (cross-post). For a single channel the
          fallback `channelId` above is used. */}
      {canCrossPost && (
        <>
          {[...selectedChannels].map((id) => (
            <input key={id} type="hidden" name="channelIds" value={id} />
          ))}
        </>
      )}

      <Input
        name="title"
        placeholder={t("titlePlaceholder")}
        maxLength={160}
        className="border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
      />

      {/* Admin-only cross-post channel picker */}
      {canCrossPost && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Post to:
          </span>
          {/* Compact summary chips for selected channels */}
          {[...selectedChannels].map((id) => {
            const c = channelById.get(id);
            if (!c) return null;
            const removable = selectedChannels.size > 1;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
              >
                <ChannelKindIcon kind={c.kind} className="h-3 w-3" />
                <span>#{c.slug}</span>
                {removable && (
                  <button
                    type="button"
                    onClick={() => toggleChannel(id)}
                    aria-label={`Remove #${c.slug}`}
                    className="rounded-full p-0.5 text-primary/70 hover:bg-primary/15 hover:text-primary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}

          {/* Picker dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              <span>Add channel</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {pickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setPickerOpen(false)}
                />
                <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-xl">
                  {(crossPostChannels ?? []).map((c) => {
                    const checked = selectedChannels.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleChannel(c.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <ChannelKindIcon
                          kind={c.kind}
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        />
                        <span className="flex-1 truncate">{c.name}</span>
                        {c.id === channelId && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Current
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {selectedChannels.size > 1 && (
            <span className="text-[11px] text-muted-foreground">
              · posting to {selectedChannels.size} channels
            </span>
          )}
        </div>
      )}

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

      {/* Media section — M24: device upload + URL fallback */}
      {mediaOpen ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            {t("mediaLabel")}
          </label>
          <ImageUploader value={images} onChange={setImages} max={4} />
          <Textarea
            name="mediaUrls"
            rows={2}
            placeholder={t("mediaPlaceholder")}
            className="text-xs"
          />
          {/* Hidden field syncs uploaded URLs into form payload (server merges these with mediaUrls textarea) */}
          <input
            type="hidden"
            name="uploadedImageUrls"
            value={JSON.stringify(images)}
          />
        </div>
      ) : (
        <>
          <input type="hidden" name="mediaUrls" value="" />
          <input type="hidden" name="uploadedImageUrls" value="[]" />
        </>
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
