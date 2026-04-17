"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteEventAction } from "@/server/events";

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  function onClick() {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    start(async () => {
      const fd = new FormData();
      fd.append("eventId", eventId);
      await deleteEventAction(fd);
    });
  }
  return (
    <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
