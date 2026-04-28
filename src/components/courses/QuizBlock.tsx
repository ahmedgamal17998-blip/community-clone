"use client";

/**
 * QuizBlock — renders a quiz lesson for either the admin (editor mode) or
 * the member (player mode), depending on the `mode` prop.
 *
 * Editor: add/remove/edit questions and options, mark correct answers,
 *         tweak passing score, save settings.
 * Player: take the quiz, submit, see score + pass/fail. If passed, the
 *         lesson is auto-completed server-side.
 */

import { useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  Check,
  X,
  CircleDashed,
  HelpCircle,
  Send,
} from "lucide-react";
import {
  upsertQuizAction,
  addQuestionAction,
  updateQuestionAction,
  deleteQuestionAction,
  addOptionAction,
  updateOptionAction,
  deleteOptionAction,
  submitQuizAttemptAction,
} from "@/server/quiz-actions";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Option = {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
};

type Question = {
  id: string;
  text: string;
  type: string; // SINGLE | MULTIPLE
  order: number;
  options: Option[];
};

type Quiz = {
  id: string;
  passingScore: number;
  shuffleQuestions: boolean;
  allowRetake: boolean;
  questions: Question[];
};

type Props = {
  lessonId: string;
  initialQuiz: Quiz | null;
  mode: "edit" | "play";
  // For play mode
  alreadyPassed?: boolean;
  bestScore?: { correct: number; total: number; passed: boolean } | null;
};

// ═════════════════════════════════════════════════════════════════════════════

export function QuizBlock({
  lessonId,
  initialQuiz,
  mode,
  alreadyPassed,
  bestScore,
}: Props) {
  if (mode === "edit") {
    return <QuizEditor lessonId={lessonId} initial={initialQuiz} />;
  }
  return (
    <QuizPlayer
      quiz={initialQuiz}
      alreadyPassed={alreadyPassed}
      bestScore={bestScore}
    />
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

function QuizEditor({
  lessonId,
  initial,
}: {
  lessonId: string;
  initial: Quiz | null;
}) {
  const [pending, startTransition] = useTransition();
  const [quiz, setQuiz] = useState<Quiz | null>(initial);

  const ensureQuiz = async () => {
    if (quiz) return quiz;
    const res = await upsertQuizAction({ lessonId });
    if (res?.ok && res.quizId) {
      const fresh: Quiz = {
        id: res.quizId,
        passingScore: 70,
        shuffleQuestions: false,
        allowRetake: true,
        questions: [],
      };
      setQuiz(fresh);
      return fresh;
    }
    return null;
  };

  const updateSettings = (
    patch: Partial<Pick<Quiz, "passingScore" | "shuffleQuestions" | "allowRetake">>,
  ) => {
    if (!quiz) return;
    setQuiz({ ...quiz, ...patch });
    startTransition(async () => {
      await upsertQuizAction({
        lessonId,
        passingScore: patch.passingScore ?? quiz.passingScore,
        shuffleQuestions: patch.shuffleQuestions ?? quiz.shuffleQuestions,
        allowRetake: patch.allowRetake ?? quiz.allowRetake,
      });
    });
  };

  const addQuestion = () => {
    const text = prompt("Question text", "What is…?");
    if (!text || !text.trim()) return;
    startTransition(async () => {
      const q = await ensureQuiz();
      if (!q) return;
      const res = await addQuestionAction({
        quizId: q.id,
        text: text.trim(),
        type: "SINGLE",
      });
      if (res?.ok && res.questionId) {
        setQuiz((prev) =>
          prev
            ? {
                ...prev,
                questions: [
                  ...prev.questions,
                  {
                    id: res.questionId!,
                    text: text.trim(),
                    type: "SINGLE",
                    order: prev.questions.length,
                    options: [],
                  },
                ],
              }
            : prev,
        );
      }
    });
  };

  const renameQuestion = (q: Question) => {
    const text = prompt("Edit question", q.text);
    if (!text || !text.trim() || text === q.text) return;
    startTransition(async () => {
      await updateQuestionAction({ questionId: q.id, text: text.trim() });
      setQuiz((prev) =>
        prev
          ? {
              ...prev,
              questions: prev.questions.map((x) =>
                x.id === q.id ? { ...x, text: text.trim() } : x,
              ),
            }
          : prev,
      );
    });
  };

  const setQuestionType = (q: Question, type: "SINGLE" | "MULTIPLE") => {
    startTransition(async () => {
      await updateQuestionAction({ questionId: q.id, type });
      setQuiz((prev) =>
        prev
          ? {
              ...prev,
              questions: prev.questions.map((x) =>
                x.id === q.id ? { ...x, type } : x,
              ),
            }
          : prev,
      );
    });
  };

  const removeQuestion = (q: Question) => {
    if (!confirm("Delete this question?")) return;
    startTransition(async () => {
      await deleteQuestionAction({ questionId: q.id });
      setQuiz((prev) =>
        prev ? { ...prev, questions: prev.questions.filter((x) => x.id !== q.id) } : prev,
      );
    });
  };

  const addOption = (q: Question) => {
    const text = prompt("Option text", "");
    if (!text || !text.trim()) return;
    startTransition(async () => {
      const res = await addOptionAction({
        questionId: q.id,
        text: text.trim(),
      });
      if (res?.ok && res.optionId) {
        setQuiz((prev) =>
          prev
            ? {
                ...prev,
                questions: prev.questions.map((x) =>
                  x.id === q.id
                    ? {
                        ...x,
                        options: [
                          ...x.options,
                          {
                            id: res.optionId!,
                            text: text.trim(),
                            isCorrect: false,
                            order: x.options.length,
                          },
                        ],
                      }
                    : x,
                ),
              }
            : prev,
        );
      }
    });
  };

  const toggleOptionCorrect = (q: Question, o: Option) => {
    const next = !o.isCorrect;
    setQuiz((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions.map((x) =>
              x.id === q.id
                ? {
                    ...x,
                    options:
                      q.type === "SINGLE"
                        ? // Single-choice: only one correct.
                          x.options.map((y) => ({
                            ...y,
                            isCorrect: y.id === o.id ? next : false,
                          }))
                        : x.options.map((y) =>
                            y.id === o.id ? { ...y, isCorrect: next } : y,
                          ),
                  }
                : x,
            ),
          }
        : prev,
    );
    startTransition(async () => {
      // For SINGLE, also clear the previous correct one.
      if (q.type === "SINGLE") {
        for (const y of q.options) {
          if (y.id !== o.id && y.isCorrect) {
            await updateOptionAction({ optionId: y.id, isCorrect: false });
          }
        }
      }
      await updateOptionAction({ optionId: o.id, isCorrect: next });
    });
  };

  const renameOption = (o: Option) => {
    const text = prompt("Edit option", o.text);
    if (!text || !text.trim() || text === o.text) return;
    startTransition(async () => {
      await updateOptionAction({ optionId: o.id, text: text.trim() });
      setQuiz((prev) =>
        prev
          ? {
              ...prev,
              questions: prev.questions.map((q) => ({
                ...q,
                options: q.options.map((y) =>
                  y.id === o.id ? { ...y, text: text.trim() } : y,
                ),
              })),
            }
          : prev,
      );
    });
  };

  const removeOption = (q: Question, o: Option) => {
    if (!confirm("Delete this option?")) return;
    startTransition(async () => {
      await deleteOptionAction({ optionId: o.id });
      setQuiz((prev) =>
        prev
          ? {
              ...prev,
              questions: prev.questions.map((x) =>
                x.id === q.id
                  ? { ...x, options: x.options.filter((y) => y.id !== o.id) }
                  : x,
              ),
            }
          : prev,
      );
    });
  };

  return (
    <div className="space-y-5">
      {/* Settings */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <HelpCircle className="h-4 w-4 text-primary" />
          Quiz settings
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Passing score (%)
            <input
              type="number"
              min={0}
              max={100}
              value={quiz?.passingScore ?? 70}
              onChange={(e) => updateSettings({ passingScore: Number(e.target.value) })}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={quiz?.shuffleQuestions ?? false}
              onChange={(e) => updateSettings({ shuffleQuestions: e.target.checked })}
            />
            <span>Shuffle questions</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={quiz?.allowRetake ?? true}
              onChange={(e) => updateSettings({ allowRetake: e.target.checked })}
            />
            <span>Allow retake</span>
          </label>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">
            Questions
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({quiz?.questions.length ?? 0})
            </span>
          </h3>
          <button
            type="button"
            onClick={addQuestion}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add question
          </button>
        </div>

        {(quiz?.questions ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No questions yet. Click <b>Add question</b> to create the first one.
          </p>
        ) : (
          <ul className="space-y-3">
            {quiz!.questions.map((q, i) => (
              <li key={q.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <span className="text-xs font-bold text-muted-foreground">
                    Q{i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => renameQuestion(q)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-primary"
                  >
                    {q.text}
                  </button>
                  <select
                    value={q.type}
                    onChange={(e) =>
                      setQuestionType(q, e.target.value as "SINGLE" | "MULTIPLE")
                    }
                    className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                  >
                    <option value="SINGLE">Single answer</option>
                    <option value="MULTIPLE">Multiple answers</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeQuestion(q)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete question"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <ul className="divide-y divide-border">
                  {q.options.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-accent/30"
                    >
                      <button
                        type="button"
                        onClick={() => toggleOptionCorrect(q, o)}
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          o.isCorrect
                            ? "border-green-500 bg-green-500/15 text-green-700 dark:text-green-400"
                            : "border-input text-muted-foreground hover:border-primary",
                        )}
                        title={o.isCorrect ? "Correct" : "Mark correct"}
                      >
                        {o.isCorrect ? <Check className="h-3 w-3" /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => renameOption(o)}
                        className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary"
                      >
                        {o.text}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOption(q, o)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete option"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => addOption(q)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-border bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add option
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Player ──────────────────────────────────────────────────────────────────

function QuizPlayer({
  quiz,
  alreadyPassed,
  bestScore,
}: {
  quiz: Quiz | null;
  alreadyPassed?: boolean;
  bestScore?: { correct: number; total: number; passed: boolean } | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    score: number;
    total: number;
    percent: number;
    passed: boolean;
    passingScore: number;
  } | null>(null);

  if (!quiz || quiz.questions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
        <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          This quiz has no questions yet.
        </p>
      </div>
    );
  }

  const setSingleAnswer = (qId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: optionId }));
  };
  const toggleMultipleAnswer = (qId: string, optionId: string) => {
    setAnswers((prev) => {
      const cur = prev[qId];
      const arr = Array.isArray(cur) ? [...cur] : [];
      const idx = arr.indexOf(optionId);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(optionId);
      return { ...prev, [qId]: arr };
    });
  };

  const submit = () => {
    startTransition(async () => {
      const res = await submitQuizAttemptAction({
        quizId: quiz.id,
        answers,
      });
      if (res?.ok) {
        setResult({
          score: res.score,
          total: res.total,
          percent: res.percent,
          passed: res.passed,
          passingScore: res.passingScore,
        });
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <HelpCircle className="h-4 w-4 text-primary" />
          Quiz · {quiz.questions.length} question
          {quiz.questions.length === 1 ? "" : "s"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Passing score: <b>{quiz.passingScore}%</b>
          {alreadyPassed && (
            <>
              {" · "}
              <span className="font-semibold text-green-700 dark:text-green-400">
                ✓ Already passed
              </span>
            </>
          )}
          {bestScore && !alreadyPassed && (
            <>
              {" · "}
              Best: {bestScore.correct}/{bestScore.total}
            </>
          )}
        </p>
      </div>

      {/* Result banner */}
      {result && (
        <div
          className={cn(
            "rounded-xl border p-4",
            result.passed
              ? "border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
          )}
        >
          <p className="text-sm font-bold">
            {result.passed ? "🎉 Passed!" : "Not yet passed"}
          </p>
          <p className="mt-0.5 text-xs">
            Score: {result.score}/{result.total} ({result.percent}%) · Need{" "}
            {result.passingScore}% to pass
            {result.passed && " — lesson marked complete."}
          </p>
          {!result.passed && quiz.allowRetake && (
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setResult(null);
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-3 py-1 text-xs font-semibold hover:bg-amber-500/30"
            >
              Retake
            </button>
          )}
        </div>
      )}

      {/* Questions */}
      {!result && (
        <ol className="space-y-4">
          {quiz.questions.map((q, i) => {
            const cur = answers[q.id];
            return (
              <li
                key={q.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Question {i + 1}
                    {q.type === "MULTIPLE" && (
                      <span className="ms-2 normal-case font-normal">
                        (select all that apply)
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{q.text}</p>
                </div>
                <ul className="divide-y divide-border">
                  {q.options.map((o) => {
                    const checked =
                      q.type === "SINGLE"
                        ? cur === o.id
                        : Array.isArray(cur) && cur.includes(o.id);
                    return (
                      <li key={o.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent",
                            checked && "bg-primary/5",
                          )}
                        >
                          <input
                            type={q.type === "SINGLE" ? "radio" : "checkbox"}
                            name={q.id}
                            checked={checked}
                            onChange={() =>
                              q.type === "SINGLE"
                                ? setSingleAnswer(q.id, o.id)
                                : toggleMultipleAnswer(q.id, o.id)
                            }
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="flex-1">{o.text}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      {!result && (
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? <CircleDashed className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {pending ? "Submitting…" : "Submit quiz"}
        </button>
      )}
    </div>
  );
}
