"use client";

import { useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markLessonCompleteAction } from "@/server/courses";

function SubmitButton({ alreadyComplete }: { alreadyComplete: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      <CheckCircle2 className="mr-2 h-4 w-4" />
      {pending
        ? "Saving…"
        : alreadyComplete
        ? "Mark complete & continue"
        : "Complete & continue"}
    </Button>
  );
}

type Props = {
  lessonId: string;
  alreadyComplete: boolean;
};

export function CompleteContinueButton({ lessonId, alreadyComplete }: Props) {
  return (
    <form action={markLessonCompleteAction}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <SubmitButton alreadyComplete={alreadyComplete} />
    </form>
  );
}
