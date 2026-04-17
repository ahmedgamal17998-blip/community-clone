"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { voteOnPollAction } from "@/server/poll-actions";
import { cn } from "@/lib/utils";
import type { PollData } from "@/server/posts";

type Props = {
  poll: PollData;
};

export function PollBlock({ poll }: Props) {
  const t = useTranslations("polls");
  const [isPending, startTransition] = useTransition();

  const isClosed = !!(poll.closedAt && new Date(poll.closedAt) < new Date());
  const initialHasVoted = poll.viewerVoteOptionIds.length > 0;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(poll.viewerVoteOptionIds),
  );
  // "changing" = viewer clicked "Change vote" — go back to voting mode.
  const [changing, setChanging] = useState(false);

  const hasVoted = initialHasVoted || (!changing && selected.size > 0 && isPending === false);
  const showResults = (hasVoted && !changing) || isClosed;

  function handleToggle(optionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (poll.multipleChoice) {
        if (next.has(optionId)) {
          next.delete(optionId);
        } else {
          next.add(optionId);
        }
      } else {
        next.clear();
        next.add(optionId);
      }
      return next;
    });
  }

  function handleVote() {
    if (selected.size === 0) return;
    const fd = new FormData();
    fd.set("pollId", poll.id);
    fd.set("optionIds", [...selected].join(","));
    setChanging(false);
    startTransition(async () => {
      await voteOnPollAction(fd);
    });
  }

  const totalVotes = poll.totalVotes;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-semibold">{poll.question}</p>

      {isClosed ? (
        <p className="text-xs text-muted-foreground">{t("closed")}</p>
      ) : null}

      <div className="space-y-2">
        {poll.options.map((option) => {
          const pct = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0;
          const isViewerChoice = poll.viewerVoteOptionIds.includes(option.id);
          const isSelectedNow = selected.has(option.id);

          if (showResults) {
            return (
              <div key={option.id} className="space-y-0.5">
                <div className="flex items-center justify-between text-sm">
                  <span className={cn("font-medium", isViewerChoice && "text-primary")}>
                    {option.text}
                    {isViewerChoice ? (
                      <span className="ml-1.5 text-xs text-primary">({t("yourVote")})</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isViewerChoice ? "bg-primary" : "bg-border",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("votes", { count: option.voteCount })}
                </p>
              </div>
            );
          }

          // Voting mode.
          const InputTag = poll.multipleChoice ? "input" : "input";
          const inputType = poll.multipleChoice ? "checkbox" : "radio";

          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-sm transition-colors",
                isSelectedNow
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/50 hover:bg-accent",
              )}
            >
              <InputTag
                type={inputType}
                name="pollOption"
                value={option.id}
                checked={isSelectedNow}
                onChange={() => handleToggle(option.id)}
                className="accent-primary"
                disabled={isPending}
              />
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          {t("totalVotes", { count: totalVotes })}
        </p>

        {!showResults ? (
          <Button
            type="button"
            size="sm"
            disabled={isPending || selected.size === 0}
            onClick={handleVote}
          >
            {isPending ? "…" : t("vote")}
          </Button>
        ) : !isClosed ? (
          <button
            type="button"
            onClick={() => {
              setChanging(true);
              setSelected(new Set());
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("change")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
