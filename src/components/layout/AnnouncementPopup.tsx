"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { dismissAnnouncementAction } from "@/server/actions/announcement";

export function AnnouncementPopup({
  announcement,
}: {
  announcement: {
    id: string;
    title: string;
    body: string;
    ctaUrl: string | null;
    durationSec: number;
  };
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (announcement.durationSec > 0) {
      const t = setTimeout(() => {
        close();
      }, announcement.durationSec * 1000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement.durationSec]);

  const close = async () => {
    setOpen(false);
    try {
      await dismissAnnouncementAction({ announcementId: announcement.id });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("dismiss announcement error:", e);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border bg-background p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{announcement.title}</h3>
        <button onClick={close} className="rounded-md p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
        {announcement.body}
      </p>
      {announcement.ctaUrl && (
        <div className="mt-3">
          <Link
            href={announcement.ctaUrl}
            onClick={close}
            className="inline-block rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Open
          </Link>
        </div>
      )}
    </div>
  );
}
