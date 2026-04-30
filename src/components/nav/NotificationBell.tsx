"use client";

/**
 * NotificationBell — top-nav bell with unread badge + dropdown list.
 * Polls /api/notifications/unread-count every 30s while tab is visible.
 *
 * M15: when Pusher is available, subscribes to private-user-{viewerId} for
 * live notification.created events and shows a brief toast. Polling kept as
 * fallback when Pusher is unavailable.
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
import { useChannel, useEvent } from "@/lib/pusher-client";

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

type ToastItem = { id: string; snippet: string | null; href: string };

export function NotificationBell({ viewerId }: { viewerId?: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [, startTransition] = useTransition();
  const mountedRef = useRef(true);

  // M15: subscribe to private-user channel for live notifications.
  const pusherChannel = useChannel(viewerId ? `private-user-${viewerId}` : null);

  useEvent<{ id: string; type: string; snippet: string | null; href: string }>(
    pusherChannel,
    "notification.created",
    (data) => {
      if (!data?.id) return;
      // Increment bell badge.
      setCount((c) => c + 1);
      // Show a brief toast.
      const toast: ToastItem = {
        id: data.id,
        snippet: data.snippet ?? null,
        href: data.href,
      };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    },
  );

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
    // M15: skip polling interval when Pusher channel is active.
    if (pusherChannel) {
      return () => {
        mountedRef.current = false;
      };
    }
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
  }, [fetchCount, pusherChannel]);

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
    <>
      {/* M15: live notification toasts (fixed bottom-right, auto-fade after 4s) */}
      {toasts.length > 0 ? (
        <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <a
              key={t.id}
              href={t.href}
              className="pointer-events-auto flex max-w-xs items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-sm animate-in fade-in slide-in-from-bottom-2"
            >
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 truncate text-foreground">
                {t.snippet ?? "New notification"}
              </span>
            </a>
          ))}
        </div>
      ) : null}

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            title="Notifications"
            className="relative h-8 w-8 sm:h-9 sm:w-9"
          >
            <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
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
    </>
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
