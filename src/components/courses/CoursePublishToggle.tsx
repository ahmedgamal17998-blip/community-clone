"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setCoursePublishedAction } from "@/server/courses";

/**
 * One-click course-level publish toggle — appears in the course outline
 * header so admins don't have to dig through Settings to make the course
 * visible to members.
 *
 * State machine: published / draft. We optimistically render the new state
 * and revert if the action throws.
 */
export function CoursePublishToggle({
  courseId,
  initialPublished,
}: {
  courseId: string;
  initialPublished: boolean;
}) {
  const [published, setPublished] = useState(initialPublished);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !published;
    setPublished(next); // optimistic
    startTransition(async () => {
      try {
        await setCoursePublishedAction({ courseId, published: next });
      } catch {
        setPublished(!next); // revert
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        published
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
      }`}
      title={
        published
          ? "Course is visible to members. Click to unpublish."
          : "Course is a DRAFT — members can't see it. Click to publish."
      }
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : published ? (
        <Eye className="h-3.5 w-3.5" />
      ) : (
        <EyeOff className="h-3.5 w-3.5" />
      )}
      {published ? "Published" : "Draft — Publish"}
    </button>
  );
}
