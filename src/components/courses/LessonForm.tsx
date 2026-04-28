import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VideoUpload } from "@/components/courses/VideoUpload";
import { CoverUpload } from "@/components/courses/CoverUpload";
import { ResourceUpload } from "@/components/courses/ResourceUpload";
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

export function LessonForm(props: Props) {
  const isEdit = props.mode === "edit";
  const l = isEdit ? props.lesson : null;
  const action = isEdit ? updateLessonAction : createLessonAction;

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
        <Label htmlFor="body">Lesson body (markdown)</Label>
        <Textarea
          id="body"
          name="body"
          rows={10}
          maxLength={40000}
          defaultValue={l?.body ?? ""}
          placeholder="# Heading&#10;&#10;Write the lesson content in **markdown**."
        />
      </div>

      <ResourceUpload name="resources" defaultValue={l?.resources ?? null} />

      <div className="flex items-center gap-2">
        <Button type="submit">{isEdit ? "Save lesson" : "Create lesson"}</Button>
      </div>
    </form>
  );
}
