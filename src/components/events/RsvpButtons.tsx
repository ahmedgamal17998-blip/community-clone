"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { rsvpEventAction } from "@/server/events";
import { cn } from "@/lib/utils";

type Status = "GOING" | "MAYBE" | "DECLINED";

export function RsvpButtons({
  eventId,
  occurrenceStartsAt,
  initialStatus,
  counts,
}: {
  eventId: string;
  occurrenceStartsAt: string | null;
  initialStatus: Status | null;
  counts: { GOING: number; MAYBE: number; DECLINED: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [optimisticCounts, setOptimisticCounts] = useState(counts);

  function setRsvp(next: Status) {
    if (pending || next === status) return;
    const prev = status;
    setStatus(next);
    // Optimistic count adjust
    setOptimisticCounts((c) => {
      const n = { ...c };
      if (prev) n[prev] = Math.max(0, n[prev] - 1);
      n[next] = n[next] + 1;
      return n;
    });
    start(async () => {
      const fd = new FormData();
      fd.append("eventId", eventId);
      fd.append("status", next);
      if (occurrenceStartsAt) fd.append("occurrenceStartsAt", occurrenceStartsAt);
      const r = await rsvpEventAction(fd);
      if (!r?.ok) {
        // rollback
        setStatus(prev);
        setOptimisticCounts(counts);
      } else {
        router.refresh();
      }
    });
  }

  const buttons: { key: Status; label: string }[] = [
    { key: "GOING", label: "Going" },
    { key: "MAYBE", label: "Maybe" },
    { key: "DECLINED", label: "Declined" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <Button
          key={b.key}
          variant={status === b.key ? "default" : "outline"}
          size="sm"
          onClick={() => setRsvp(b.key)}
          disabled={pending}
          className={cn(status === b.key && "ring-2 ring-primary/40")}
        >
          {b.label}
          <span className="ml-1 rounded-full bg-background/30 px-1.5 text-[10px] tabular-nums">
            {optimisticCounts[b.key]}
          </span>
        </Button>
      ))}
    </div>
  );
}
