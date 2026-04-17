"use client";

/**
 * NotificationBell — top-nav bell with unread badge + dropdown list.
 * Polls /api/notifications/unread-count every 30s while tab is visible.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  markAllReadAction,
  markReadAction,
} from "@/server/notifications";

type Actor = {
  id: string;
  name: string | null;
  handle: string;
  image: string | null;
};

type Row = {
  id: string;
  type: string;
  snippet: string | null;
  href: string;
  readAt: string | null;
  createdAt: string;
  actor: Actor | null;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function describe(type: string, actorName: string): string {
  switch (type) {
    case "MENTION":
      return `${actorName} mentioned you`;
    case "COMMENT_ON_POST":
      return `${actorName} commented on your post`;
    case "REPLY":
      return `${actorName} replied to your comment`;
    case "REACTION_ON_POST":
      return `${actorName} reacted to your post`;
    case "MEMBERSHIP_APPROVED":
      return `You've been approved`;
    case "INVITE_ACCEPTED":
      return `${actorName} accepted your invite`;
    default:
      return type;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const mountedRef = useRef(true);

  // Poll unread count.
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      if (mountedRef.current) setCount(data.count ?? 0);
    } catch {
      /* ignore network errors */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchCount();
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") fetchCount();
    }, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") fetchCount();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchCount]);

  // Load list when opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/notifications/list", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { rows: Row[] };
        if (!cancelled) setRows(data.rows ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const unread = rows.filter((r) => !r.readAt);
  const read = rows.filter((r) => r.readAt);

  function handleMarkAll() {
    startTransition(async () => {
      await markAllReadAction();
      setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
      setCount(0);
    });
  }

  function handleRowClick(r: Row) {
    if (!r.readAt) {
      const fd = new FormData();
      fd.set("notificationId", r.id);
      startTransition(async () => {
        await markReadAction(fd);
      });
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          title="Notifications"
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-h-[520px] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-sm font-semibold">Notifications</div>
          <button
            type="button"
            className="text-xs text-primary hover:underline disabled:opacity-50"
            onClick={handleMarkAll}
            disabled={count === 0}
          >
            Mark all as read
          </button>
        </div>

        {loading && rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            You're all caught up
          </div>
        ) : (
          <>
            {unread.length > 0 ? (
              <Section title="New" rows={unread} onClick={handleRowClick} />
            ) : null}
            {read.length > 0 ? (
              <Section title="Earlier" rows={read} onClick={handleRowClick} />
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Section({
  title,
  rows,
  onClick,
}: {
  title: string;
  rows: Row[];
  onClick: (r: Row) => void;
}) {
  return (
    <div>
      <div className="sticky top-0 bg-card/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <ul>
        {rows.map((r) => {
          const actorName = r.actor?.name ?? (r.actor ? `@${r.actor.handle}` : "Someone");
          return (
            <li key={r.id}>
              <Link
                href={r.href}
                onClick={() => onClick(r)}
                className={`flex gap-3 px-3 py-2 text-sm hover:bg-accent ${!r.readAt ? "bg-primary/5" : ""}`}
              >
                <div className="mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                  {r.actor?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.actor.image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                      {actorName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {describe(r.type, actorName)}
                  </div>
                  {r.snippet ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {r.snippet}
                    </div>
                  ) : null}
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {timeAgo(r.createdAt)}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
