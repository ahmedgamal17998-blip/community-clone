"use client";

/**
 * Shared thread view — used by /chat/[id] and the channel Chat tab.
 *
 * Polls /api/chat/threads/[id]/messages?after=<lastId> every 3s while visible
 * and fires markThreadReadAction every 5s.
 *
 * M15: when NEXT_PUBLIC_PUSHER_APP_KEY is set, subscribes to
 * private-thread-{threadId} for live new-message and typing events.
 * Falls back to polling when Pusher is unavailable.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Pin, Reply, X, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MentionTextarea } from "@/components/mention/MentionTextarea";
import {
  sendMessageAction,
  markThreadReadAction,
  togglePinAction,
  deleteMessageAction,
} from "@/server/chat";
import { MediaAttach, type Attached } from "@/components/chat/MediaAttach";
import { useChannel, useEvent } from "@/lib/pusher-client";

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

export function ChatThreadView(props: ChatThreadViewProps) {
  const {
    threadId,
    kind,
    viewerId,
    viewerIsAdmin = false,
    initialMessages,
    pinned: initialPinned,
    participants,
  } = props;
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [pinned, setPinned] = useState<ChatMessageView[]>(initialPinned);
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<Attached | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // M15: Pusher real-time state.
  // typingUsers: map of userId → { handle, name, expiresAt }
  const [typingUsers, setTypingUsers] = useState<
    Record<string, { handle: string; name: string | null; expiresAt: number }>
  >({});
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Subscribe to the private thread channel (no-op when Pusher unavailable).
  const pusherChannel = useChannel(`private-thread-${threadId}`);

  // M15: handle incoming real-time messages from Pusher.
  useEvent<ChatMessageView>(pusherChannel, "new-message", (data) => {
    if (!data?.id) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      if (seen.has(data.id)) return prev;
      return [...prev, data];
    });
    // Clear typing indicator for the sender.
    setTypingUsers((prev) => {
      if (!data.authorId || !prev[data.authorId]) return prev;
      const next = { ...prev };
      delete next[data.authorId];
      return next;
    });
  });

  // M15: handle typing events from Pusher.
  useEvent<{ userId: string; handle: string; name: string | null }>(
    pusherChannel,
    "typing",
    (data) => {
      if (!data?.userId || data.userId === viewerId) return;
      const expiresAt = Date.now() + 3000;
      setTypingUsers((prev) => ({
        ...prev,
        [data.userId]: { handle: data.handle, name: data.name, expiresAt },
      }));
      // Auto-clear after 3s.
      if (typingTimeoutsRef.current[data.userId]) {
        clearTimeout(typingTimeoutsRef.current[data.userId]);
      }
      typingTimeoutsRef.current[data.userId] = setTimeout(() => {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[data.userId];
          return next;
        });
        delete typingTimeoutsRef.current[data.userId];
      }, 3000);
    },
  );

  // Clean up timeouts on unmount.
  useEffect(() => {
    return () => {
      for (const t of Object.values(typingTimeoutsRef.current)) {
        clearTimeout(t);
      }
    };
  }, []);

  // Debounced typing indicator fire (800ms, skip if empty).
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireTyping = useCallback(
    (value: string) => {
      if (!value.trim()) return;
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = setTimeout(() => {
        fetch("/api/chat/typing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId }),
        }).catch(() => {
          /* ignore */
        });
      }, 800);
    },
    [threadId],
  );

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
  // M15: skip polling when Pusher channel is active (real-time takes over).
  useEffect(() => {
    // If Pusher is connected and subscribed, skip polling.
    if (pusherChannel) return;

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
  }, [threadId, messages, pusherChannel]);

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

  // Build date-separated message list
  const groupedMessages = groupByDate(messages);

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[480px] flex-col rounded-xl border border-border bg-card overflow-hidden">
      {/* Pinned message banner */}
      {pinned.length > 0 ? (
        <div className="flex items-center gap-2 border-b border-amber-200/60 bg-amber-50 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-950/40">
          <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 truncate text-xs">
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              {pinned[0].author.name ?? `@${pinned[0].author.handle}`}:
            </span>{" "}
            <span className="text-amber-700 dark:text-amber-400">
              {pinned[0].body ?? (pinned[0].mediaType ? `[${pinned[0].mediaType}]` : "")}
            </span>
          </div>
          {pinned.length > 1 && (
            <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
              +{pinned.length - 1} more
            </span>
          )}
        </div>
      ) : null}

      {/* Message area with dot-pattern wallpaper */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto bg-muted/20 px-4 py-3"
        style={{
          backgroundImage: "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          overflowAnchor: "none",
        }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet — say hi.
          </div>
        ) : (
          <div className="space-y-1">
            {groupedMessages.map(({ label, msgs }) => (
              <div key={label}>
                {/* Date separator */}
                <div className="my-3 flex items-center justify-center">
                  <span className="rounded-full bg-black/10 px-3 py-0.5 text-[11px] font-medium text-foreground/60 dark:bg-white/10">
                    {label}
                  </span>
                </div>
                {msgs.map((m) => (
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Typing indicator */}
      {Object.keys(typingUsers).length > 0 ? (
        <TypingStrip typingUsers={typingUsers} />
      ) : null}

      {/* Reply preview bar */}
      {replyTo ? (
        <div className="flex items-center justify-between border-t border-border bg-muted/50 px-3 py-1.5 text-xs">
          <div className="min-w-0 flex-1 truncate">
            Replying to{" "}
            <span className="font-semibold">
              {replyTo.author.name ?? `@${replyTo.author.handle}`}
            </span>
            : <span className="text-muted-foreground">{replyTo.body}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="ml-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {/* Compose form */}
      <form
        onSubmit={handleSend}
        className="flex flex-col gap-2 border-t border-border bg-card p-3"
      >
        {props.groupSlug ? (
          <MentionTextarea
            value={body}
            onChange={(val) => {
              setBody(val);
              fireTyping(val);
            }}
            groupSlug={props.groupSlug}
            placeholder="Type a message… use @ to mention"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.defaultPrevented) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        ) : (
          <Textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              fireTyping(e.target.value);
            }}
            placeholder="Type a message…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        )}
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

/** Group messages by calendar date for date separators */
function groupByDate(
  msgs: ChatMessageView[],
): Array<{ label: string; msgs: ChatMessageView[] }> {
  const groups: Array<{ label: string; msgs: ChatMessageView[] }> = [];
  let currentLabel = "";
  for (const m of msgs) {
    const d = new Date(m.createdAt);
    const label = dateSeparatorLabel(d);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, msgs: [] });
    }
    groups[groups.length - 1].msgs.push(m);
  }
  return groups;
}

function dateSeparatorLabel(d: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
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
    <li
      className={`group mb-1 flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar — only for others */}
      {!isMine ? (
        <div className="mb-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
          {msg.author.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={msg.author.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">
              {(msg.author.name ?? msg.author.handle).slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      ) : (
        /* Spacer so "mine" bubbles don't span full width */
        <div className="w-7 shrink-0" />
      )}

      {/* Bubble */}
      <div className={`relative max-w-[72%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
        {/* Sender name (channel only, others only) */}
        {isChannel && !isMine ? (
          <Link
            href={`/profile/${msg.author.handle}`}
            className="mb-0.5 ml-1 text-[11px] font-semibold text-primary hover:underline"
          >
            {msg.author.name ?? `@${msg.author.handle}`}
          </Link>
        ) : null}

        {/* Bubble body */}
        <div
          className={`relative rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
            isMine
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-card text-foreground dark:bg-[#2d2d2d]"
          }`}
        >
          {/* Tail */}
          <span
            aria-hidden
            className={`absolute bottom-0 h-2.5 w-2.5 ${
              isMine
                ? "right-[-6px] [clip-path:polygon(0_0,0%_100%,100%_100%)] bg-primary"
                : "left-[-6px] [clip-path:polygon(100%_0,0%_100%,100%_100%)] bg-card dark:bg-[#2d2d2d]"
            }`}
          />

          {/* Reply quote */}
          {msg.replyTo ? (
            <div
              className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${
                isMine
                  ? "border-white/50 bg-white/10"
                  : "border-primary/60 bg-muted/60"
              }`}
            >
              <div className={`font-semibold ${isMine ? "text-white/90" : "text-primary"}`}>
                {msg.replyTo.author?.name ?? `@${msg.replyTo.author?.handle}`}
              </div>
              <div className={`truncate ${isMine ? "text-white/70" : "text-muted-foreground"}`}>
                {msg.replyTo.body}
              </div>
            </div>
          ) : null}

          {/* Text body */}
          {msg.body ? (
            <div className="whitespace-pre-wrap break-words">{msg.body}</div>
          ) : null}

          {/* Media */}
          {msg.mediaUrl ? (
            <div className="mt-1">
              {msg.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.mediaUrl}
                  alt=""
                  className="max-h-56 max-w-full rounded-xl object-contain"
                />
              ) : msg.mediaType === "audio" ? (
                <audio controls src={msg.mediaUrl} className="max-w-full" />
              ) : (
                <a
                  href={msg.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:opacity-80 ${
                    isMine ? "border-white/30 bg-white/10 text-white" : "border-border bg-muted"
                  }`}
                >
                  Download file
                </a>
              )}
            </div>
          ) : null}

          {/* Timestamp + edited + pinned */}
          <div
            className={`mt-0.5 flex items-center gap-1 text-[10px] ${
              isMine ? "justify-end text-white/60" : "text-muted-foreground"
            }`}
          >
            {msg.editedAt ? <span className="italic">edited</span> : null}
            {msg.pinned ? <Pin className="h-2.5 w-2.5" /> : null}
            <time dateTime={msg.createdAt}>{timeLabel(msg.createdAt)}</time>
          </div>
        </div>

        {/* Hover action row */}
        <div
          className={`mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
            isMine ? "flex-row-reverse" : "flex-row"
          }`}
        >
          <button
            type="button"
            onClick={onReply}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Reply"
            title="Reply"
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
          {(canPin || canDelete) ? (
            <div className="relative">
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
                  className={`absolute top-6 z-10 w-32 rounded-md border border-border bg-card py-1 text-xs shadow-md ${
                    isMine ? "right-0" : "left-0"
                  }`}
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  {canPin ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-accent"
                      onClick={() => { setMenuOpen(false); onPin(); }}
                    >
                      <Pin className="h-3 w-3" />
                      {msg.pinned ? "Unpin" : "Pin"}
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1 text-left text-destructive hover:bg-accent"
                      onClick={() => { setMenuOpen(false); onDelete(); }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** M15: Typing indicator strip — bouncing dots, WhatsApp-style */
function TypingStrip({
  typingUsers,
}: {
  typingUsers: Record<
    string,
    { handle: string; name: string | null; expiresAt: number }
  >;
}) {
  const names = Object.values(typingUsers).map((u) => u.name ?? `@${u.handle}`);
  if (names.length === 0) return null;

  let label: string;
  if (names.length === 1) {
    label = `${names[0]}`;
  } else if (names.length === 2) {
    label = `${names[0]} & ${names[1]}`;
  } else {
    label = `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }

  return (
    <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-2">
      {/* Bubble with bouncing dots */}
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5 shadow-sm dark:bg-[#2d2d2d]">
        <span
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-[11px] italic text-muted-foreground">{label} is typing…</span>
    </div>
  );
}
