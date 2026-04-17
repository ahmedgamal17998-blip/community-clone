"use client";

import { useTransition, useState } from "react";
import { toggleReactionAction } from "@/server/reaction-actions";
import { cn } from "@/lib/utils";

const EMOJI_LIST = ["❤️", "👍", "🎉", "😂", "🤔", "👏"] as const;
type Emoji = (typeof EMOJI_LIST)[number];

type ReactionData = {
  emoji: string;
  count: number;
  viewerReacted: boolean;
};

type Props = {
  postId?: string;
  commentId?: string;
  reactions: ReactionData[];
  viewerId: string;
};

type LocalState = Map<string, { count: number; viewerReacted: boolean }>;

function buildLocalState(reactions: ReactionData[]): LocalState {
  const m = new Map<string, { count: number; viewerReacted: boolean }>();
  for (const r of reactions) {
    m.set(r.emoji, { count: r.count, viewerReacted: r.viewerReacted });
  }
  return m;
}

export function ReactionBar({ postId, commentId, reactions, viewerId: _viewerId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState<LocalState>(() => buildLocalState(reactions));

  function handleToggle(emoji: Emoji) {
    // Optimistic update.
    setLocal((prev) => {
      const next = new Map(prev);
      const current = next.get(emoji) ?? { count: 0, viewerReacted: false };
      if (current.viewerReacted) {
        const newCount = current.count - 1;
        if (newCount <= 0) {
          next.delete(emoji);
        } else {
          next.set(emoji, { count: newCount, viewerReacted: false });
        }
      } else {
        next.set(emoji, { count: current.count + 1, viewerReacted: true });
      }
      return next;
    });

    startTransition(async () => {
      const fd = new FormData();
      fd.set("emoji", emoji);
      if (postId) fd.set("postId", postId);
      if (commentId) fd.set("commentId", commentId);
      await toggleReactionAction(fd);
    });
  }

  // Build display list: emojis with count > 0 first, then the rest as dimmed "add" buttons.
  const activeEmojis = EMOJI_LIST.filter((e) => local.has(e));
  const inactiveEmojis = EMOJI_LIST.filter((e) => !local.has(e));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {activeEmojis.map((emoji) => {
        const state = local.get(emoji)!;
        return (
          <button
            key={emoji}
            type="button"
            disabled={isPending}
            onClick={() => handleToggle(emoji)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              state.viewerReacted
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent",
            )}
          >
            <span>{emoji}</span>
            <span>{state.count}</span>
          </button>
        );
      })}

      {/* "Add reaction" picker — show inactive emojis as small ghost buttons */}
      {inactiveEmojis.length > 0 && (
        <div className="group relative">
          <button
            type="button"
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            aria-label="Add reaction"
          >
            <span>+</span>
            <span>😊</span>
          </button>
          {/* Hover popover */}
          <div className="absolute bottom-full left-0 z-10 mb-1 hidden flex-wrap gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-md group-hover:flex">
            {inactiveEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={isPending}
                onClick={() => handleToggle(emoji)}
                className="rounded p-1 text-base transition-colors hover:bg-accent"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
