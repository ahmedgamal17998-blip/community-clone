"use client";

/**
 * Shared thread view — used by /chat/[id] and the channel Chat tab.
 *
 * Polls /api/chat/threads/[id]/messages?after=<lastId> every 3s while visible
 * and fires markThreadReadAction every 5s.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Pin, Reply, X, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  sendMessageAction,
  markThreadReadAction,
  togglePinAction,
  deleteMessageAction,
} from "@/server/chat";
import { MediaAttach, type Attached } from "@/components/chat/MediaAttach";

type Author = {
  id: string;
  name: string | null;
  handle: string;
  image: string | null;
};

export type ChatMessageView = {
  id: string;
  threadId: string;
  authorId: string;
  body: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  pinned: boolean;
  editedAt: string | null;
  createdAt: string;
  author: Author;
  replyTo: {
    id: string;
    body: string | null;
    author: { name: string | null; handle: string } | null;
  } | null;
};

export type ChatThreadViewProps = {
  threadId: string;
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  viewerId: string;
  viewerIsAdmin?: boolean;
  groupSlug?: string; // for mention context if needed
  initialMessages: ChatMessageView[];
  pinned: ChatMessageView[];
  participants: Author[];
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString();
}

export function ChatThreadView({
  threadId,
  kind,
  viewerId,
  viewerIsAdmin = false,
  initialMessages,
  pinned: initialPinned,
  participants,
}: ChatThreadViewProps) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [pinned, setPinned] = useState<ChatMessageView[]>(initialPinned);
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<Attached | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Track scroll position so we only auto-stick when user is already near bottom.
  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < 80;
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Initial scroll to bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Poll for new messages every 3s while visible.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      const lastId = messages[messages.length - 1]?.id;
      try {
        const url = lastId
          ? `/api/chat/threads/${threadId}/messages?after=${encodeURIComponent(lastId)}`
          : `/api/chat/threads/${threadId}/messages`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { rows: ChatMessageView[] };
        if (cancelled || !data.rows?.length) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const next = [...prev];
          for (const row of data.rows) {
            if (!seen.has(row.id)) next.push(row);
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    }

    const iv = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [threadId, messages]);

  // Mark read on mount + every 5s.
  useEffect(() => {
    function markRead() {
      const fd = new FormData();
      fd.set("threadId", threadId);
      startTransition(async () => {
        await markThreadReadAction(fd);
      });
    }
    markRead();
    const iv = setInterval(markRead, 5000);
    return () => clearInterval(iv);
  }, [threadId]);

  // TODO(pusher): typing events — real-time typing indicator would go here.

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (sending) return;
    const trimmed = body.trim();
    if (!trimmed && !attached) return;

    setSending(true);
    const fd = new FormData();
    fd.set("threadId", threadId);
    if (trimmed) fd.set("body", trimmed);
    if (attached) {
      fd.set("mediaUrl", attached.url);
      fd.set("mediaType", attached.mediaType);
    }
    if (replyTo) fd.set("replyToId", replyTo.id);

    // Optimistic insert.
    const tempId = `tmp-${Date.now()}`;
    const optimistic: ChatMessageView = {
      id: tempId,
      threadId,
      authorId: viewerId,
      body: trimmed || null,
      mediaUrl: attached?.url ?? null,
      mediaType: attached?.mediaType ?? null,
      pinned: false,
      editedAt: null,
      createdAt: new Date().toISOString(),
      author: {
        id: viewerId,
        name: null,
        handle: "you",
        image: null,
      },
      replyTo: replyTo
        ? {
            id: replyTo.id,
            body: replyTo.body,
            author: { name: replyTo.author.name, handle: replyTo.author.handle },
          }
        : null,
    };
    atBottomRef.current = true;
    setMessages((prev) => [...prev, optimistic]);
    setBody("");
    setAttached(null);
    setReplyTo(null);

    try {
      const result = await sendMessageAction(fd);
      if (!result?.ok) {
        // Rollback optimistic on failure.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } finally {
      setSending(false);
    }
  }

  async function handlePin(messageId: string) {
    const fd = new FormData();
    fd.set("messageId", messageId);
    try {
      await togglePinAction(fd);
      // Locally toggle.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, pinned: !m.pinned } : m,
        ),
      );
      setPinned((prev) => {
        const msg = messages.find((m) => m.id === messageId);
        if (!msg) return prev;
        const existing = prev.find((p) => p.id === messageId);
        if (existing) return prev.filter((p) => p.id !== messageId);
        return [{ ...msg, pinned: true }, ...prev];
      });
    } catch {
      /* ignore */
    }
  }

  async function handleDelete(messageId: string) {
    if (!confirm("Delete this message?")) return;
    const fd = new FormData();
    fd.set("messageId", messageId);
    try {
      await deleteMessageAction(fd);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setPinned((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[480px] flex-col rounded-xl border border-border bg-card">
      {pinned.length > 0 ? (
        <div className="border-b border-border bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Pin className="h-3 w-3" />
            Pinned
          </div>
          <ul className="mt-1 space-y-1">
            {pinned.slice(0, 3).map((p) => (
              <li key={p.id} className="truncate text-xs">
                <span className="font-medium">
                  {p.author.name ?? `@${p.author.handle}`}:
                </span>{" "}
                <span className="text-muted-foreground">
                  {p.body ?? (p.mediaType ? `[${p.mediaType}]` : "")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ overflowAnchor: "none" }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet — say hi.
          </div>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                msg={m}
                viewerId={viewerId}
                isChannel={kind === "CHANNEL"}
                viewerIsAdmin={viewerIsAdmin}
                onReply={() => setReplyTo(m)}
                onPin={() => handlePin(m.id)}
                onDelete={() => handleDelete(m.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {replyTo ? (
        <div className="flex items-center justify-between border-t border-border bg-muted/50 px-3 py-1.5 text-xs">
          <div className="min-w-0 flex-1 truncate">
            Replying to{" "}
            <span className="font-medium">
              {replyTo.author.name ?? `@${replyTo.author.handle}`}
            </span>
            : <span className="text-muted-foreground">{replyTo.body}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      <form
        onSubmit={handleSend}
        className="flex flex-col gap-2 border-t border-border p-3"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <MediaAttach value={attached} onChange={setAttached} />
          <Button type="submit" size="sm" disabled={sending || (!body.trim() && !attached)}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageRow({
  msg,
  viewerId,
  isChannel,
  viewerIsAdmin,
  onReply,
  onPin,
  onDelete,
}: {
  msg: ChatMessageView;
  viewerId: string;
  isChannel: boolean;
  viewerIsAdmin: boolean;
  onReply: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isMine = msg.authorId === viewerId;
  const canDelete = isMine || (isChannel && viewerIsAdmin);
  const canPin = isChannel && viewerIsAdmin;

  return (
    <li className="group flex gap-2">
      <div className="mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
        {msg.author.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={msg.author.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
            {(msg.author.name ?? msg.author.handle).slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={`/profile/${msg.author.handle}`}
            className="text-sm font-medium hover:underline"
          >
            {msg.author.name ?? `@${msg.author.handle}`}
          </Link>
          <span className="text-[11px] text-muted-foreground">
            {timeLabel(msg.createdAt)}
          </span>
          {msg.editedAt ? (
            <span className="text-[11px] italic text-muted-foreground">
              edited
            </span>
          ) : null}
          {msg.pinned ? <Pin className="h-3 w-3 text-primary" /> : null}
        </div>
        {msg.replyTo ? (
          <div className="mt-0.5 rounded border-l-2 border-primary/40 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
            <span className="font-medium">
              {msg.replyTo.author?.name ?? `@${msg.replyTo.author?.handle}`}
            </span>
            : <span className="truncate">{msg.replyTo.body}</span>
          </div>
        ) : null}
        {msg.body ? (
          <div className="whitespace-pre-wrap break-words text-sm">{msg.body}</div>
        ) : null}
        {msg.mediaUrl ? (
          <div className="mt-1">
            {msg.mediaType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={msg.mediaUrl}
                alt=""
                className="max-h-64 max-w-sm rounded-md border border-border object-contain"
              />
            ) : msg.mediaType === "audio" ? (
              <audio controls src={msg.mediaUrl} className="max-w-sm" />
            ) : (
              <a
                href={msg.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs hover:bg-accent"
              >
                Download file
              </a>
            )}
          </div>
        ) : null}
      </div>
      <div className="relative flex shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onReply}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Reply"
          title="Reply"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        {canPin || canDelete ? (
          <>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen ? (
              <div
                className="absolute right-0 top-6 z-10 w-32 rounded-md border border-border bg-card py-1 text-xs shadow-md"
                onMouseLeave={() => setMenuOpen(false)}
              >
                {canPin ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-accent"
                    onClick={() => {
                      setMenuOpen(false);
                      onPin();
                    }}
                  >
                    <Pin className="h-3 w-3" />
                    {msg.pinned ? "Unpin" : "Pin"}
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1 text-left text-destructive hover:bg-accent"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}
