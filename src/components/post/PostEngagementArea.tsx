"use client";

/**
 * PostEngagementArea — Facebook-style engagement row.
 *
 * Renders (in order):
 *  1. Reaction summary row  (emoji bubbles + total count → click opens ReactionsModal)
 *  2. Divider
 *  3. Action row            (Like w/ hover picker | Comment | Share | Save)
 *  4. Expanded comment list + composer (toggled by Comment button)
 *  5. ReactionsModal        (overlay, tabbed by emoji)
 */

import { useState, useRef, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ThumbsUp, MessageCircle, Share2, Bookmark, X } from "lucide-react";
import { toggleReactionAction } from "@/server/reaction-actions";
import { toggleSavePostAction } from "@/server/save-actions";
import { CommentItem } from "@/components/post/CommentItem";
import { CommentComposer } from "@/components/post/CommentComposer";
import { cn } from "@/lib/utils";
import type { CommentWithReplies, ReactionSummary } from "@/server/comments";

// ── Emoji config ──────────────────────────────────────────────────────────────
const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;
type Emoji = (typeof EMOJI_LIST)[number];

const EMOJI_LABELS: Record<string, string> = {
  "👍": "Like",
  "❤️": "Love",
  "😂": "Haha",
  "😮": "Wow",
  "😢": "Sad",
  "😡": "Angry",
};

// ── Local state helpers ───────────────────────────────────────────────────────
type LocalReaction = { count: number; viewerReacted: boolean };
type LocalState = Map<string, LocalReaction>;

function buildLocalState(reactions: ReactionSummary[]): LocalState {
  const m = new Map<string, LocalReaction>();
  for (const r of reactions) m.set(r.emoji, { count: r.count, viewerReacted: r.viewerReacted });
  return m;
}

// ── Component props ───────────────────────────────────────────────────────────
type Props = {
  postId: string;
  reactions: ReactionSummary[];
  viewerId: string;
  commentCount: number;
  comments: CommentWithReplies[];
  viewerCanModerate: boolean;
  groupSlug?: string;
  /** Whether the viewer has already saved this post (server-rendered). */
  savedByViewer?: boolean;
};

// ═════════════════════════════════════════════════════════════════════════════
export function PostEngagementArea({
  postId,
  reactions,
  viewerId,
  commentCount,
  comments,
  viewerCanModerate,
  groupSlug,
  savedByViewer = false,
}: Props) {
  const t = useTranslations("comments");

  // ── Reaction state ──────────────────────────────────────────────────────
  const [local, setLocal] = useState<LocalState>(() => buildLocalState(reactions));
  const [, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);


  // ── UI state ────────────────────────────────────────────────────────────
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(savedByViewer);

  // ── Derived values ──────────────────────────────────────────────────────
  const viewerReaction = EMOJI_LIST.find((e) => local.get(e)?.viewerReacted);
  const totalCount = Array.from(local.values()).reduce((s, v) => s + v.count, 0);
  const topEmojis = [...local.entries()]
    .filter(([, v]) => v.count > 0)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 3)
    .map(([emoji]) => emoji);

  // ── Reaction toggle ─────────────────────────────────────────────────────
  function handleToggle(emoji: Emoji) {
    setPickerOpen(false);
    setLocal((prev) => {
      const next = new Map(prev);
      // Clear previous viewer reaction
      for (const [e, v] of next.entries()) {
        if (v.viewerReacted && e !== emoji) {
          const nc = v.count - 1;
          if (nc <= 0) next.delete(e);
          else next.set(e, { count: nc, viewerReacted: false });
        }
      }
      const cur = next.get(emoji) ?? { count: 0, viewerReacted: false };
      if (cur.viewerReacted) {
        const nc = cur.count - 1;
        if (nc <= 0) next.delete(emoji);
        else next.set(emoji, { count: nc, viewerReacted: false });
      } else {
        next.set(emoji, { count: cur.count + 1, viewerReacted: true });
      }
      return next;
    });

    startTransition(async () => {
      const fd = new FormData();
      fd.set("emoji", emoji);
      fd.set("postId", postId);
      await toggleReactionAction(fd);
    });
  }

  // ── Hover picker logic ──────────────────────────────────────────────────
  function isTouchDevice() {
    return typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
  }

  function onLikeMouseEnter() {
    if (isTouchDevice()) return; // touch handled by click
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setPickerOpen(true), 400);
  }

  function onLikeMouseLeave() {
    if (isTouchDevice()) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    // Delay close so mouse can move into picker
    hoverTimerRef.current = setTimeout(() => {
      if (!pickerRef.current?.matches(":hover")) setPickerOpen(false);
    }, 150);
  }

  function onPickerMouseEnter() {
    if (isTouchDevice()) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }

  function onPickerMouseLeave() {
    if (isTouchDevice()) return;
    setPickerOpen(false);
  }

  function handleLikeClick() {
    // On touch devices: tap toggles the picker (then tap an emoji to react)
    if (isTouchDevice()) {
      setPickerOpen((v) => !v);
      return;
    }
    if (pickerOpen) return;
    handleToggle("👍");
  }

  // ── Share ───────────────────────────────────────────────────────────────
  async function handleCopyLink() {
    setShareOpen(false);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Reaction summary row ── */}
      {totalCount > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="group flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {/* Stacked emoji bubbles */}
            <div className="flex -space-x-1">
              {topEmojis.map((emoji) => (
                <span
                  key={emoji}
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary text-[10px] ring-[1.5px] ring-card"
                >
                  {emoji}
                </span>
              ))}
            </div>
            <span className="ml-1 group-hover:underline">{totalCount}</span>
          </button>

          {commentCount > 0 && (
            <button
              type="button"
              onClick={() => setCommentsOpen((v) => !v)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              {t("count", { count: commentCount })}
            </button>
          )}
        </div>
      )}

      {/* ── Divider ── */}
      <div className="mt-3 border-t border-border" />

      {/* ── Action row ── */}
      <div className="mt-0.5 flex items-stretch">
        {/* Like button */}
        <div className="relative flex-1">
          <button
            type="button"
            onMouseEnter={onLikeMouseEnter}
            onMouseLeave={onLikeMouseLeave}
            onClick={handleLikeClick}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-semibold transition-colors hover:bg-accent",
              viewerReaction ? "text-primary" : "text-muted-foreground",
            )}
          >
            {viewerReaction ? (
              <span className="text-base leading-none">{viewerReaction}</span>
            ) : (
              <ThumbsUp className="h-4 w-4" />
            )}
            <span>{viewerReaction ? (EMOJI_LABELS[viewerReaction] ?? "Like") : "Like"}</span>
          </button>

          {/* Reactions picker — hover on desktop, tap-toggle on mobile */}
          {pickerOpen && (
            <div
              ref={pickerRef}
              onMouseEnter={onPickerMouseEnter}
              onMouseLeave={onPickerMouseLeave}
              className="absolute bottom-full start-0 z-30 mb-2 flex flex-col-reverse items-center gap-0.5 rounded-full border border-border bg-popover px-1.5 py-2 shadow-xl sm:flex-row sm:rounded-full sm:px-2 sm:py-1.5"
              style={{ animation: "fbReactPop 0.18s cubic-bezier(0.175,0.885,0.32,1.4) both" }}
            >
              {EMOJI_LIST.map((emoji) => {
                const isActive = local.get(emoji)?.viewerReacted;
                return (
                  <button
                    key={emoji}
                    type="button"
                    title={EMOJI_LABELS[emoji]}
                    onClick={() => { handleToggle(emoji); setPickerOpen(false); }}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-xl transition-all duration-150",
                      "hover:scale-[1.35] hover:bg-accent",
                      isActive && "scale-110 ring-2 ring-primary ring-offset-1",
                    )}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Comment button */}
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-semibold transition-colors hover:bg-accent",
            commentsOpen ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MessageCircle className="h-4 w-4" />
          <span>Comment</span>
        </button>

        {/* Share button */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setShareOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent"
          >
            <Share2 className="h-4 w-4" />
            <span>Share</span>
          </button>
          {shareOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShareOpen(false)} />
              <div className="absolute bottom-full right-0 z-30 mb-1 min-w-[160px] overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <span className="text-base">🔗</span>
                  <span>{copied ? "Copied!" : "Copy link"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <span className="text-base">📤</span>
                  <span>Share to feed</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <span className="text-base">💬</span>
                  <span>Send in chat</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={() => {
            // Optimistic flip; rollback if the server rejects.
            const next = !saved;
            setSaved(next);
            startTransition(async () => {
              const res = await toggleSavePostAction({ postId });
              if (!res?.ok) setSaved(!next);
              else setSaved(res.saved);
            });
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-semibold transition-colors hover:bg-accent",
            saved ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
          <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
        </button>
      </div>

      {/* ── Expanded comments ── */}
      {commentsOpen && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="space-y-3">
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
          <CommentComposer postId={postId} groupSlug={groupSlug} />
        </div>
      )}

      {/* ── Reactions modal ── */}
      {modalOpen && (
        <ReactionsModal
          reactions={[...local.entries()].map(([emoji, v]) => ({ emoji, count: v.count }))}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ── Reactions modal ───────────────────────────────────────────────────────────
function ReactionsModal({
  reactions,
  onClose,
}: {
  reactions: { emoji: string; count: number }[];
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const total = reactions.reduce((s, r) => s + r.count, 0);
  const activeCount =
    activeTab === "all"
      ? total
      : (reactions.find((r) => r.emoji === activeTab)?.count ?? 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">Reactions</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors",
              activeTab === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            All {total}
          </button>
          {reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => setActiveTab(r.emoji)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
                activeTab === r.emoji
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {r.emoji} {r.count}
            </button>
          ))}
        </div>

        {/* Body */}
        <p className="text-sm text-muted-foreground">
          {activeCount} {activeCount === 1 ? "person" : "people"} reacted
          {activeTab !== "all" ? ` with ${activeTab}` : ""}
        </p>
      </div>
    </>
  );
}
