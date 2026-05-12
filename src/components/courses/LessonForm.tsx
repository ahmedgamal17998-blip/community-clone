"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VideoUpload } from "@/components/courses/VideoUpload";
import { CoverUpload } from "@/components/courses/CoverUpload";
import { ResourceUpload } from "@/components/courses/ResourceUpload";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import {
  createLessonAction,
  updateLessonAction,
} from "@/server/courses";

type LessonShape = {
  id: string;
  title: string;
  body: string | null;
  videoUrl: string | null;
  thumbnailUrl?: string | null;
  resources?: string | null;
  durationSec: number | null;
};

type Props =
  | { mode: "create"; courseId: string }
  | { mode: "edit"; courseId: string; lesson: LessonShape };

/**
 * Lesson editor form. Posts to the server action via plain form submission
 * (no useFormState because we have no per-field error UI), but `body` is
 * powered by TipTap so admins can bold / list / color / link without
 * writing markdown. We serialize the editor's HTML into a hidden input so
 * the server side sees a normal `body` field.
 */
export function LessonForm(props: Props) {
  const isEdit = props.mode === "edit";
  const l = isEdit ? props.lesson : null;
  const action = isEdit ? updateLessonAction : createLessonAction;

  // Rich-text body. We keep the HTML string in state and mirror it to a
  // hidden input so the existing server action keeps working without any
  // form-data shape change.
  const [body, setBody] = useState<string>(l?.body ?? "");

  return (
    <form action={action} className="space-y-5">
      {isEdit ? (
        <input type="hidden" name="lessonId" value={l!.id} />
      ) : (
        <input type="hidden" name="courseId" value={props.courseId} />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="title">Lesson title</Label>
        <Input
          id="title"
          name="title"
          required
          minLength={2}
          maxLength={140}
          defaultValue={l?.title ?? ""}
        />
      </div>

      <VideoUpload name="videoUrl" defaultValue={l?.videoUrl} />

      <CoverUpload
        name="thumbnailUrl"
        defaultValue={l?.thumbnailUrl ?? null}
        label="Lesson thumbnail (optional)"
      />

      <div className="space-y-1.5">
        <Label htmlFor="durationSec">Duration (seconds, optional)</Label>
        <Input
          id="durationSec"
          name="durationSec"
          type="number"
          min={0}
          max={60 * 60 * 24}
          defaultValue={l?.durationSec ?? ""}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Lesson body</Label>
        <RichTextEditor
          value={body}
          onChange={(_json, html) => setBody(html)}
          placeholder="Write the lesson content — use the toolbar for headings, bold, lists, colors…"
          minHeight={200}
          maxLength={40000}
        />
        <input type="hidden" name="body" value={body} />
      </div>

      <ResourceUpload name="resources" defaultValue={l?.resources ?? null} />

      <div className="flex items-center gap-2">
        <Button type="submit">{isEdit ? "Save lesson" : "Create lesson"}</Button>
      </div>
    </form>
  );
}
