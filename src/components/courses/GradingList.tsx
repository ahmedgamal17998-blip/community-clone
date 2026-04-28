"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink } from "lucide-react";
import { gradeAssignmentAction } from "@/server/assignment-actions";
import { cn } from "@/lib/utils";

type Submission = {
  id: string;
  userName: string;
  userHandle: string;
  userImage: string | null;
  textAnswer: string | null;
  fileUrl: string | null;
  score: number | null;
  feedback: string | null;
  gradedAt: Date | string | null;
  submittedAt: Date | string;
};

export function GradingList({
  submissions,
  maxScore,
}: {
  submissions: Submission[];
  maxScore: number;
}) {
  if (submissions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No submissions yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {submissions.map((s) => (
        <SubmissionCard key={s.id} submission={s} maxScore={maxScore} />
      ))}
    </ul>
  );
}

function SubmissionCard({
  submission,
  maxScore,
}: {
  submission: Submission;
  maxScore: number;
}) {
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState<number>(submission.score ?? 0);
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [graded, setGraded] = useState(!!submission.gradedAt);
  const [savedFlash, setSavedFlash] = useState(false);

  const submit = () => {
    startTransition(async () => {
      const res = await gradeAssignmentAction({
        submissionId: submission.id,
        score,
        feedback: feedback.trim() || null,
      });
      if (res?.ok) {
        setGraded(true);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    });
  };

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {submission.userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={submission.userImage}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            submission.userName.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{submission.userName}</div>
          <div className="text-[11px] text-muted-foreground">
            Submitted {new Date(submission.submittedAt).toLocaleString()}
            {graded && submission.gradedAt && " · graded"}
          </div>
        </div>
        {graded && (
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-bold text-green-700 dark:text-green-400">
            {submission.score ?? score}/{maxScore}
          </span>
        )}
      </div>

      <div className="space-y-3 p-4">
        {submission.textAnswer && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Text answer
            </p>
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              {submission.textAnswer}
            </p>
          </div>
        )}

        {submission.fileUrl && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              File
            </p>
            <a
              href={submission.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent"
            >
              <ExternalLink className="h-3 w-3" />
              Open file
            </a>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Score (/{maxScore})
            </span>
            <input
              type="number"
              min={0}
              max={maxScore}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Feedback
            </span>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className={cn(
              "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
            )}
          >
            {pending ? "Saving…" : graded ? "Update grade" : "Save grade"}
          </button>
          {savedFlash && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
