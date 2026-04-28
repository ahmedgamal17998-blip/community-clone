import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { getCourse, getLesson, deleteLessonAction } from "@/server/courses";
import { getEnrollmentStatus } from "@/server/stripe-actions";
import { Button } from "@/components/ui/button";
import { LessonSidebar } from "@/components/courses/LessonSidebar";
import { LessonPlayer } from "@/components/courses/LessonPlayer";
import { CompleteContinueButton } from "@/components/courses/CompleteContinueButton";
import { QuizBlock } from "@/components/courses/QuizBlock";
import { AssignmentBlock } from "@/components/courses/AssignmentBlock";

export default async function LessonPage({
  params,
}: {
  params: { slug: string; courseSlug: string; lessonSlug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE") notFound();
  const isAdmin = hasMinRole(me.role as Role, "ADMIN");

  const courseData = await getCourse({
    groupId: group.id,
    slug: params.courseSlug,
    viewerId: session.user.id,
  });
  if (!courseData) notFound();

  const { course, lessons, progressPercent } = courseData;

  // M16: gate paid course access.
  if (course.priceType === "PAID" && !isAdmin) {
    const enrollment = await getEnrollmentStatus(session.user.id, course.id);
    if (!enrollment || enrollment.status !== "ACTIVE") {
      redirect(`/groups/${group.slug}/learning/${course.slug}?blocked=1`);
    }
  }
  const lessonData = await getLesson({
    courseId: course.id,
    slug: params.lessonSlug,
    viewerId: session.user.id,
  });
  if (!lessonData) notFound();
  const { lesson, prev, next, completed } = lessonData;

  // Phase 2 — fetch quiz/assignment payload based on lesson kind.
  const lessonRow = await db.lesson.findUnique({
    where: { id: lesson.id },
    select: { kind: true },
  });
  const lessonKind = lessonRow?.kind ?? "VIDEO";

  type QuizWithQuestions = Awaited<
    ReturnType<
      typeof db.quiz.findUnique<{
        where: { lessonId: string };
        include: {
          questions: { include: { options: true }; orderBy: { order: "asc" } };
        };
      }>
    >
  >;
  let quizData: QuizWithQuestions = null;
  let bestAttempt: { correct: number; total: number; passed: boolean } | null = null;
  if (lessonKind === "QUIZ") {
    quizData = await db.quiz.findUnique({
      where: { lessonId: lesson.id },
      include: {
        questions: { include: { options: true }, orderBy: { order: "asc" } },
      },
    });
    if (quizData && !isAdmin) {
      const att = await db.quizAttempt.findFirst({
        where: { userId: session.user.id, quizId: quizData.id },
        orderBy: [{ passed: "desc" }, { score: "desc" }],
      });
      if (att) {
        bestAttempt = {
          correct: att.score,
          total: att.total,
          passed: att.passed,
        };
      }
    }
  }

  let assignmentData: Awaited<ReturnType<typeof db.assignment.findUnique>> | null =
    null;
  let mySubmission: Awaited<
    ReturnType<typeof db.assignmentSubmission.findUnique>
  > | null = null;
  if (lessonKind === "ASSIGNMENT") {
    assignmentData = await db.assignment.findUnique({
      where: { lessonId: lesson.id },
    });
    if (assignmentData && !isAdmin) {
      mySubmission = await db.assignmentSubmission.findUnique({
        where: {
          userId_assignmentId: {
            userId: session.user.id,
            assignmentId: assignmentData.id,
          },
        },
      });
    }
  }

  // Touch lastSeenAt (fire-and-forget — we don't block render).
  // Upsert directly here so we don't need a server-action round-trip.
  await db.lessonProgress
    .upsert({
      where: {
        userId_lessonId: { userId: session.user.id, lessonId: lesson.id },
      },
      create: {
        userId: session.user.id,
        lessonId: lesson.id,
        courseId: course.id,
      },
      update: { lastSeenAt: new Date() },
    })
    .catch(() => {
      /* non-fatal */
    });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <Link
            href={`/groups/${group.slug}/learning/${course.slug}`}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to course
          </Link>
          <h2 className="mb-3 text-sm font-semibold">{course.title}</h2>
          <LessonSidebar
            groupSlug={group.slug}
            courseSlug={course.slug}
            lessons={lessons}
            activeSlug={lesson.slug}
            progressPercent={progressPercent}
          />
        </div>
      </aside>

      <div className="space-y-6">
        <LessonPlayer
          title={lesson.title}
          videoUrl={lesson.videoUrl}
          body={lesson.body}
        />

        {/* Phase 2: quiz/assignment blocks render below the lesson player. */}
        {lessonKind === "QUIZ" && (
          <QuizBlock
            lessonId={lesson.id}
            mode={isAdmin ? "edit" : "play"}
            initialQuiz={
              quizData
                ? {
                    id: quizData.id,
                    passingScore: quizData.passingScore,
                    shuffleQuestions: quizData.shuffleQuestions,
                    allowRetake: quizData.allowRetake,
                    questions: quizData.questions.map((q) => ({
                      id: q.id,
                      text: q.text,
                      type: q.type,
                      order: q.order,
                      options: q.options.map((o) => ({
                        id: o.id,
                        text: o.text,
                        isCorrect: o.isCorrect,
                        order: o.order,
                      })),
                    })),
                  }
                : null
            }
            alreadyPassed={!!bestAttempt?.passed}
            bestScore={bestAttempt}
          />
        )}

        {lessonKind === "ASSIGNMENT" && (
          <AssignmentBlock
            lessonId={lesson.id}
            mode={isAdmin ? "edit" : "play"}
            initialAssignment={
              assignmentData
                ? {
                    id: assignmentData.id,
                    instructions: assignmentData.instructions,
                    submissionType: assignmentData.submissionType,
                    maxScore: assignmentData.maxScore,
                  }
                : null
            }
            mySubmission={
              mySubmission
                ? {
                    id: mySubmission.id,
                    textAnswer: mySubmission.textAnswer,
                    fileUrl: mySubmission.fileUrl,
                    score: mySubmission.score,
                    feedback: mySubmission.feedback,
                    gradedAt: mySubmission.gradedAt,
                    submittedAt: mySubmission.submittedAt,
                  }
                : null
            }
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            {prev ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/groups/${group.slug}/learning/${course.slug}/lessons/${prev.slug}`}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Link>
              </Button>
            ) : null}
            {next ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/groups/${group.slug}/learning/${course.slug}/lessons/${next.slug}`}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                {lessonKind === "ASSIGNMENT" && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/groups/${group.slug}/learning/${course.slug}/lessons/${lesson.slug}/submissions`}
                    >
                      Submissions
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/groups/${group.slug}/learning/${course.slug}/lessons/${lesson.slug}/edit`}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Link>
                </Button>
                <form action={deleteLessonAction}>
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <Button type="submit" size="sm" variant="outline">
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </form>
              </>
            ) : null}
            <CompleteContinueButton
              lessonId={lesson.id}
              alreadyComplete={completed}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
