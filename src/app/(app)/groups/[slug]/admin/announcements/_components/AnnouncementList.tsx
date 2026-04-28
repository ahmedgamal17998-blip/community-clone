"use client";

import { useTransition } from "react";
import { deleteAnnouncementAction } from "@/server/actions/announcement";

type Row = {
  id: string;
  title: string;
  body: string;
  durationSec: number;
  startsAt: Date;
  endsAt: Date | null;
  _count: { seen: number };
};

export function AnnouncementList({
  groupId,
  announcements,
}: {
  groupId: string;
  announcements: Row[];
}) {
  const [pending, startTransition] = useTransition();

  if (announcements.length === 0) {
    return <p className="text-sm text-muted-foreground">No announcements yet.</p>;
  }

  const remove = (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    startTransition(async () => {
      await deleteAnnouncementAction({ groupId, announcementId: id });
    });
  };

  return (
    <div className="space-y-2">
      {announcements.map((a) => (
        <div key={a.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="min-w-0">
              <div className="font-medium">{a.title}</div>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{a.body}</p>
              <div className="mt-2 text-xs text-muted-foreground">
                Seen by {a._count.seen} • Auto-close {a.durationSec}s • Created{" "}
                {new Date(a.startsAt).toLocaleDateString()}
                {a.endsAt ? ` • Ends ${new Date(a.endsAt).toLocaleDateString()}` : ""}
              </div>
            </div>
            <button
              onClick={() => remove(a.id)}
              disabled={pending}
              className="rounded-md border border-destructive/30 px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
