"use client";

/**
 * AssignmentBlock — admin editor + member submission view.
 */

import { useState, useTransition } from "react";
import { ClipboardList, Send, CircleDashed, Check } from "lucide-react";
import {
  upsertAssignmentAction,
  submitAssignmentAction,
} from "@/server/assignment-actions";
import { cn } from "@/lib/utils";

type Assignment = {
  id: string;
  instructions: string | null;
  submissionType: string; // TEXT | FILE | BOTH
  maxScore: number;
};

type Submission = {
  id: string;
  textAnswer: string | null;
  fileUrl: string | null;
  score: number | null;
  feedback: string | null;
  gradedAt: Date | string | null;
  submittedAt: Date | string;
};

type Props = {
  lessonId: string;
  initialAssignment: Assignment | null;
  mode: "edit" | "play";
  // Play mode
  mySubmission?: Submission | null;
};

export function AssignmentBlock({
  lessonId,
  initialAssignment,
  mode,
  mySubmission,
}: Props) {
  if (mode === "edit") {
    return <AssignmentEditor lessonId={lessonId} initial={initialAssignment} />;
  }
  return (
    <AssignmentPlayer
      assignment={initialAssignment}
      mySubmission={mySubmission ?? null}
    />
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

function AssignmentEditor({
  lessonId,
  initial,
}: {
  lessonId: string;
  initial: Assignment | null;
}) {
  const [pending, startTransition] = useTransition();
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [submissionType, setSubmissionType] = useState(
    initial?.submissionType ?? "TEXT",
  );
  const [maxScore, setMaxScore] = useState(initial?.maxScore ?? 100);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await upsertAssignmentAction({
        lessonId,
        instructions: instructions.trim() || null,
        submissionType: submissionType as "TEXT" | "FILE" | "BOTH",
        maxScore,
      });
      setSaved(true);
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <ClipboardList className="h-4 w-4 text-primary" />
          Assignment settings
        </h3>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              Instructions
            </span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder="Describe what the member should do for this assignment…"
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                Submission type
              </span>
              <select
                value={submissionType}
                onChange={(e) => setSubmissionType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                <option value="TEXT">Text answer</option>
                <option value="FILE">File upload</option>
                <option value="BOTH">Text + file</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                Max score
              </span>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              />
            </label>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                <Check className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Player ──────────────────────────────────────────────────────────────────

function AssignmentPlayer({
  assignment,
  mySubmission,
}: {
  assignment: Assignment | null;
  mySubmission: Submission | null;
}) {
  const [pending, startTransition] = useTransition();
  const [textAnswer, setTextAnswer] = useState(mySubmission?.textAnswer ?? "");
  const [fileUrl, setFileUrl] = useState(mySubmission?.fileUrl ?? "");
  const [submitted, setSubmitted] = useState(!!mySubmission);

  if (!assignment) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          This assignment hasn't been set up yet.
        </p>
      </div>
    );
  }

  const submit = () => {
    startTransition(async () => {
      const res = await submitAssignmentAction({
        assignmentId: assignment.id,
        textAnswer: textAnswer.trim() || null,
        fileUrl: fileUrl.trim() || null,
      });
      if (res?.ok) setSubmitted(true);
    });
  };

  const graded = !!mySubmission?.gradedAt;

  return (
    <div className="space-y-5">
      {/* Instructions */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <ClipboardList className="h-4 w-4 text-primary" />
          Assignment
          <span className="ms-auto text-xs font-normal text-muted-foreground">
            Max score: {assignment.maxScore}
          </span>
        </h3>
        <p className="whitespace-pre-wrap text-sm text-foreground/85">
          {assignment.instructions ?? "No instructions provided."}
        </p>
      </div>

      {/* Grade banner */}
      {graded && (
        <div
          className={cn(
            "rounded-xl border p-4",
            "border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300",
          )}
        >
          <p className="text-sm font-bold">
            ✓ Graded: {mySubmission!.score}/{assignment.maxScore}
          </p>
          {mySubmission!.feedback && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">
              <span className="font-semibold">Feedback: </span>
              {mySubmission!.feedback}
            </p>
          )}
        </div>
      )}

      {/* Submission form */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="mb-3 text-sm font-bold">
          {submitted ? "Your submission" : "Your answer"}
        </h4>

        {(assignment.submissionType === "TEXT" ||
          assignment.submissionType === "BOTH") && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              Text answer
            </span>
            <textarea
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              rows={6}
              placeholder="Type your answer…"
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        )}

        {(assignment.submissionType === "FILE" ||
          assignment.submissionType === "BOTH") && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              File URL
            </span>
            <input
              type="url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://… (paste a public link to your file)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Tip: upload to Drive / Dropbox and share the link.
            </span>
          </label>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={submit}
            disabled={
              pending ||
              (!textAnswer.trim() && !fileUrl.trim())
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? <CircleDashed className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {pending
              ? "Submitting…"
              : submitted
                ? "Resubmit"
                : "Submit"}
          </button>
          {submitted && !graded && (
            <span className="text-xs text-muted-foreground">
              Awaiting grading from an admin.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
