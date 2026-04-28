"use client";

/**
 * WhatsApp-inspired group-chat thread view.
 *
 * Design source: Community Chat.html (Anthropic Design handoff bundle)
 * Functional logic (Pusher, polling, actions) unchanged from M15.
 *
 * Visual spec:
 *  - Mine on right (primary purple bubble), others on left (white/card bubble)
 *  - Tail radius: first msg in run gets pointed tail corner
 *  - Hover quick-react pill floats above bubble (👍❤️😂🎉 + reply + more)
 *  - Reaction chips below bubble (client-side optimistic, TODO: persist)
 *  - Gradient avatar (hsl hue from authorId hash), shown once per run
 *  - Sender name (hsl colored), shown once per run for others
 *  - Read receipts ✓✓ in timestamp for mine
 *  - Typing indicator: avatar + bouncing-dot bubble + "Name is typing…"
 *  - Composer: pill shape, inline attach/emoji/text/send-or-mic
 *  - Dot-pattern wallpaper
 *  - Pinned banner (dismissable, purple accent)
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Pin, X, Trash2, Mic, Paperclip, Smile, Send, Reply, MoreHorizontal } from "lucide-react";
import { MentionTextarea } from "@/components/mention/MentionTextarea";
import { Textarea } from "@/components/ui/textarea";
import {
  sendMessageAction,
  markThreadReadAction,
  togglePinAction,
  deleteMessageAction,
} from "@/server/chat";
import { MediaAttach, type Attached } from "@/components/chat/MediaAttach";
import { useChannel, useEvent } from "@/lib/pusher-client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  groupSlug?: string;
  initialMessages: ChatMessageView[];
  pinned: ChatMessageView[];
  participants: Author[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Consistent hue (0-359) from a string, for avatar gradients. */
function hueFromStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h % 360;
}

function initials(name: string | null, handle: string): string {
  if (name) return name.split(" ").map((p) => p[0] ?? "").slice(0, 2).join("").toUpperCase();
  return handle.slice(0, 2).toUpperCase();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const am = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${am}`;
}

function dateSeparatorLabel(d: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉"] as const;

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════

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
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<Attached | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Client-side reactions (optimistic, TODO: persist to DB)
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});

  // M15: Pusher
  const [typingUsers, setTypingUsers] = useState<
    Record<string, { handle: string; name: string | null; expiresAt: number }>
  >({});
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const pusherChannel = useChannel(`private-thread-${threadId}`);

  useEvent<ChatMessageView>(pusherChannel, "new-message", (data) => {
    if (!data?.id) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      if (seen.has(data.id)) return prev;
      return [...prev, data];
    });
    setTypingUsers((prev) => {
      if (!data.authorId || !prev[data.authorId]) return prev;
      const next = { ...prev };
      delete next[data.authorId];
      return next;
    });
  });

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

  useEffect(() => {
    return () => {
      for (const t of Object.values(typingTimeoutsRef.current)) clearTimeout(t);
    };
  }, []);

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
        }).catch(() => {});
      }, 800);
    },
    [threadId],
  );

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Poll for messages (fallback when Pusher unavailable)
  useEffect(() => {
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
          return [...prev, ...data.rows.filter((r) => !seen.has(r.id))];
        });
      } catch {}
    }
    const iv = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [threadId, messages, pusherChannel]);

  // Mark read
  useEffect(() => {
    function markRead() {
      const fd = new FormData();
      fd.set("threadId", threadId);
      startTransition(async () => { await markThreadReadAction(fd); });
    }
    markRead();
    const iv = setInterval(markRead, 5000);
    return () => clearInterval(iv);
  }, [threadId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (sending) return;
    const trimmed = body.trim();
    if (!trimmed && !attached) return;

    setSending(true);
    setEmojiOpen(false);
    const fd = new FormData();
    fd.set("threadId", threadId);
    if (trimmed) fd.set("body", trimmed);
    if (attached) { fd.set("mediaUrl", attached.url); fd.set("mediaType", attached.mediaType); }
    if (replyTo) fd.set("replyToId", replyTo.id);

    const tempId = `tmp-${Date.now()}`;
    const optimistic: ChatMessageView = {
      id: tempId, threadId, authorId: viewerId,
      body: trimmed || null,
      mediaUrl: attached?.url ?? null,
      mediaType: attached?.mediaType ?? null,
      pinned: false, editedAt: null,
      createdAt: new Date().toISOString(),
      author: { id: viewerId, name: null, handle: "you", image: null },
      replyTo: replyTo
        ? { id: replyTo.id, body: replyTo.body, author: { name: replyTo.author.name, handle: replyTo.author.handle } }
        : null,
    };
    atBottomRef.current = true;
    setMessages((prev) => [...prev, optimistic]);
    setBody("");
    setAttached(null);
    setReplyTo(null);

    try {
      const result = await sendMessageAction(fd);
      if (!result?.ok) setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  async function handlePin(messageId: string) {
    const fd = new FormData();
    fd.set("messageId", messageId);
    try {
      await togglePinAction(fd);
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, pinned: !m.pinned } : m));
      setPinned((prev) => {
        const msg = messages.find((m) => m.id === messageId);
        if (!msg) return prev;
        const existing = prev.find((p) => p.id === messageId);
        if (existing) return prev.filter((p) => p.id !== messageId);
        return [{ ...msg, pinned: true }, ...prev];
      });
    } catch {}
  }

  async function handleDelete(messageId: string) {
    if (!confirm("Delete this message?")) return;
    const fd = new FormData();
    fd.set("messageId", messageId);
    try {
      await deleteMessageAction(fd);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setPinned((prev) => prev.filter((m) => m.id !== messageId));
    } catch {}
  }

  function handleReact(msgId: string, emoji: string) {
    setReactions((prev) => {
      const msgRx = { ...(prev[msgId] ?? {}) };
      const users = [...(msgRx[emoji] ?? [])];
      const idx = users.indexOf(viewerId);
      if (idx >= 0) { users.splice(idx, 1); }
      else { users.push(viewerId); }
      if (users.length) msgRx[emoji] = users;
      else delete msgRx[emoji];
      return { ...prev, [msgId]: msgRx };
    });
  }

  // ── Build flat item list with date dividers ───────────────────────────────

  const flatItems = useMemo(() => {
    type Item =
      | { type: "divider"; label: string; key: string }
      | { type: "msg"; msg: ChatMessageView; prevMsg: ChatMessageView | null; key: string };

    const items: Item[] = [];
    let lastDay = "";
    let lastMsg: ChatMessageView | null = null;

    for (const m of messages) {
      const label = dateSeparatorLabel(new Date(m.createdAt));
      if (label !== lastDay) {
        items.push({ type: "divider", label, key: `d-${label}` });
        lastDay = label;
        lastMsg = null;
      }
      items.push({ type: "msg", msg: m, prevMsg: lastMsg, key: m.id });
      lastMsg = m;
    }
    return items;
  }, [messages]);

  // ── Render ────────────────────────────────────────────────────────────────

  const showPinnedBanner = pinned.length > 0 && !pinnedDismissed;

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      {/* Pinned banner */}
      {showPinnedBanner && (
        <PinnedBanner
          pinned={pinned[0]}
          count={pinned.length}
          onDismiss={() => setPinnedDismissed(true)}
        />
      )}

      {/* Message feed with dot-pattern wallpaper */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-2 py-2 sm:px-3"
        style={{
          backgroundImage: "radial-gradient(rgba(0,0,0,0.055) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          backgroundColor: "hsl(var(--muted)/0.4)",
          scrollbarWidth: "thin",
          overflowAnchor: "none",
        }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet — say hi 👋
          </div>
        ) : (
          <div>
            {flatItems.map((item) => {
              if (item.type === "divider") {
                return <DaySeparator key={item.key} label={item.label} />;
              }
              return (
                <MessageRow
                  key={item.key}
                  msg={item.msg}
                  prevMsg={item.prevMsg}
                  viewerId={viewerId}
                  isChannel={kind === "CHANNEL"}
                  viewerIsAdmin={viewerIsAdmin}
                  localReactions={reactions[item.msg.id] ?? {}}
                  onReply={() => setReplyTo(item.msg)}
                  onPin={() => handlePin(item.msg.id)}
                  onDelete={() => handleDelete(item.msg.id)}
                  onReact={(emoji) => handleReact(item.msg.id, emoji)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Typing indicator */}
      {Object.keys(typingUsers).length > 0 && (
        <TypingStrip typingUsers={typingUsers} />
      )}

      {/* Reply preview bar */}
      {replyTo && (
        <div
          className="flex items-center gap-3 border-t border-border bg-muted/40 px-4 py-2.5"
          style={{
            borderLeft: `3px solid hsl(${hueFromStr(replyTo.authorId)} 60% 50%)`,
          }}
        >
          <Reply className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div
              className="mb-0.5 text-xs font-bold"
              style={{ color: `hsl(${hueFromStr(replyTo.authorId)} 50% 42%)` }}
            >
              {replyTo.author.name ?? `@${replyTo.author.handle}`}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {replyTo.body ?? (replyTo.mediaType ? `[${replyTo.mediaType}]` : "…")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Composer */}
      <Composer
        body={body}
        setBody={setBody}
        sending={sending}
        attached={attached}
        setAttached={setAttached}
        emojiOpen={emojiOpen}
        setEmojiOpen={setEmojiOpen}
        groupSlug={props.groupSlug}
        textareaRef={textareaRef}
        fireTyping={fireTyping}
        onSend={handleSend}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ─ Pinned banner ─────────────────────────────────────────────────────────────
function PinnedBanner({
  pinned,
  count,
  onDismiss,
}: {
  pinned: ChatMessageView;
  count: number;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-primary/20 bg-primary/8 px-4 py-2.5">
      <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
          Pinned by {pinned.author.name ?? `@${pinned.author.handle}`}
          {count > 1 && ` · ${count} pins`}
        </div>
        <div className="truncate text-[13px] font-semibold text-primary">
          {pinned.body ?? (pinned.mediaType ? `[${pinned.mediaType}]` : "")}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-full p-1 text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─ Day separator ─────────────────────────────────────────────────────────────
function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center justify-center">
      <span className="rounded-full border border-border/60 bg-card/80 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
        {label}
      </span>
    </div>
  );
}

// ─ Message row ───────────────────────────────────────────────────────────────
function MessageRow({
  msg,
  prevMsg,
  viewerId,
  isChannel,
  viewerIsAdmin,
  localReactions,
  onReply,
  onPin,
  onDelete,
  onReact,
}: {
  msg: ChatMessageView;
  prevMsg: ChatMessageView | null;
  viewerId: string;
  isChannel: boolean;
  viewerIsAdmin: boolean;
  localReactions: Record<string, string[]>;
  onReply: () => void;
  onPin: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);

  const isMine = msg.authorId === viewerId;
  const canDelete = isMine || (isChannel && viewerIsAdmin);
  const canPin = isChannel && viewerIsAdmin;

  // "Head" = first message in a consecutive run from same sender
  const isHead =
    !prevMsg ||
    prevMsg.authorId !== msg.authorId ||
    new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 5 * 60 * 1000;

  const hue = hueFromStr(msg.authorId);

  // Bubble border-radius: tail-style (first in run has pointed corner)
  const bubbleRadius = isHead
    ? isMine
      ? "rounded-[14px] rounded-br-[4px]"
      : "rounded-[14px] rounded-bl-[4px]"
    : "rounded-[14px]";

  // Combine DB reactions with local optimistic ones
  const mergedReactions = { ...localReactions };

  const hasAnyReaction = Object.keys(mergedReactions).some((e) => mergedReactions[e].length > 0);

  return (
    <div
      className={cn("group relative mb-0.5 flex items-end gap-1.5", isMine ? "flex-row-reverse" : "flex-row")}
      onMouseEnter={() => setActionsVisible(true)}
      onMouseLeave={() => { setActionsVisible(false); setMenuOpen(false); }}
    >
      {/* Avatar gutter — only for others; mine gets no spacer */}
      {!isMine && (
        <div className="w-8 shrink-0 self-end">
          {isHead && (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
              style={{
                background: `linear-gradient(135deg, hsl(${hue} 75% 65%), hsl(${(hue + 30) % 360} 65% 55%))`,
              }}
            >
              {msg.author.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={msg.author.image} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                initials(msg.author.name, msg.author.handle)
              )}
            </div>
          )}
        </div>
      )}

      {/* Bubble column — mine gets more width since no avatar gutter */}
      <div
        className={cn(
          "flex flex-col",
          isMine ? "items-end max-w-[85%]" : "items-start max-w-[78%]",
        )}
      >
        {/* Sender name (others only, head only) */}
        {!isMine && isHead && (
          <div
            className="mb-0.5 ml-1 text-[12.5px] font-bold leading-tight"
            style={{ color: `hsl(${hue} 50% 42%)` }}
          >
            <Link href={`/profile/${msg.author.handle}`} className="hover:underline">
              {msg.author.name ?? `@${msg.author.handle}`}
            </Link>
          </div>
        )}

        {/* Hover quick-react pill (appears above bubble) */}
        {actionsVisible && (
          <div
            className={cn(
              "absolute -top-8 z-20 flex items-center gap-0.5 rounded-full border border-border bg-card px-1.5 py-1 shadow-md",
              isMine ? "right-0" : "left-0",
            )}
          >
            {QUICK_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => onReact(em)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all hover:scale-125 hover:bg-accent",
                  mergedReactions[em]?.includes(viewerId) && "bg-primary/10 ring-1 ring-primary",
                )}
                title={em}
              >
                {em}
              </button>
            ))}
            <div className="mx-0.5 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={onReply}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Reply"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
            {(canPin || canDelete) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="More"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {menuOpen && (
                  <div
                    className={cn(
                      "absolute top-8 z-30 min-w-[130px] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl",
                      isMine ? "right-0" : "left-0",
                    )}
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    {canPin && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
                        onClick={() => { setMenuOpen(false); onPin(); }}
                      >
                        <Pin className="h-3.5 w-3.5" />
                        {msg.pinned ? "Unpin" : "Pin message"}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-accent"
                        onClick={() => { setMenuOpen(false); onDelete(); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            "relative px-3 py-2 text-sm leading-relaxed shadow-sm",
            bubbleRadius,
            isMine
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground dark:bg-[#2d2d2d]",
          )}
        >
          {/* Reply quote inside bubble */}
          {msg.replyTo && (
            <div
              className={cn(
                "mb-2 rounded-md px-2.5 py-1.5 text-xs",
                isMine
                  ? "border-l-2 border-white/50 bg-white/15"
                  : "border-l-2 border-primary/60 bg-muted/50",
              )}
            >
              <div
                className={cn("mb-0.5 font-bold", isMine ? "text-white/90" : "text-primary")}
              >
                {msg.replyTo.author?.name ?? `@${msg.replyTo.author?.handle ?? "?"}`}
              </div>
              <div className={cn("truncate", isMine ? "text-white/70" : "text-muted-foreground")}>
                {msg.replyTo.body}
              </div>
            </div>
          )}

          {/* Text body */}
          {msg.body && (
            <div className="whitespace-pre-wrap break-words">{msg.body}</div>
          )}

          {/* Media */}
          {msg.mediaUrl && (
            <div className="mt-1.5">
              {msg.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.mediaUrl}
                  alt=""
                  className="max-h-56 max-w-[280px] rounded-xl object-contain"
                />
              ) : msg.mediaType === "audio" ? (
                <audio controls src={msg.mediaUrl} className="max-w-full" />
              ) : (
                <a
                  href={msg.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:opacity-80",
                    isMine
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-border bg-muted",
                  )}
                >
                  <Paperclip className="h-3 w-3" />
                  Download file
                </a>
              )}
            </div>
          )}

          {/* Timestamp + edited + read receipts */}
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-[10.5px]",
              isMine ? "justify-end text-white/55" : "text-muted-foreground",
            )}
          >
            {msg.editedAt && <span className="italic">edited ·</span>}
            {msg.pinned && <Pin className="h-2.5 w-2.5" />}
            <time dateTime={msg.createdAt}>{fmtTime(msg.createdAt)}</time>
            {isMine && <ReadReceipt />}
          </div>
        </div>

        {/* Reaction chips (below bubble) */}
        {hasAnyReaction && (
          <div
            className={cn(
              "mt-1 flex flex-wrap gap-1",
              isMine ? "justify-end" : "justify-start",
            )}
          >
            {Object.entries(mergedReactions)
              .filter(([, users]) => users.length > 0)
              .map(([emoji, users]) => {
                const iReacted = users.includes(viewerId);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(emoji)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors",
                      iReacted
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
                    )}
                  >
                    <span className="text-sm">{emoji}</span>
                    <span>{users.length}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─ Read receipt (double checkmark) ───────────────────────────────────────────
function ReadReceipt() {
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 18 12"
      fill="none"
      className="inline-block"
      style={{ verticalAlign: "middle" }}
    >
      <path
        d="M1 6.5l3.5 3.5L11 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 6.5l3.5 3.5L17 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─ Typing indicator ───────────────────────────────────────────────────────────
function TypingStrip({
  typingUsers,
}: {
  typingUsers: Record<string, { handle: string; name: string | null; expiresAt: number }>;
}) {
  const names = Object.values(typingUsers).map((u) => u.name ?? `@${u.handle}`);
  const firstUser = Object.keys(typingUsers)[0];
  if (names.length === 0) return null;

  const label =
    names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} & ${names[1]}`
    : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;

  const hue = firstUser ? hueFromStr(firstUser) : 260;

  return (
    <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-2">
      {/* Mini avatar */}
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 75% 65%), hsl(${(hue + 30) % 360} 65% 55%))`,
        }}
      >
        {names[0]?.slice(0, 1).toUpperCase() ?? "?"}
      </div>
      {/* Bouncing dots bubble */}
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 shadow-sm dark:bg-[#2d2d2d]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <span className="text-[11px] italic text-muted-foreground">{label} is typing…</span>
    </div>
  );
}

// ─ Composer ───────────────────────────────────────────────────────────────────
const EMOJI_GRID = "😀 😂 🥹 😍 🤩 🤔 👀 🙌 👏 👋 🔥 💯 ✨ 🎉 💜 ❤️ 🙏 ☕ 🌱 🌍 🚀 ⚡ 📩 📷 🎤 📖 💡 ⭐ 👍 😮".split(" ");

function Composer({
  body,
  setBody,
  sending,
  attached,
  setAttached,
  emojiOpen,
  setEmojiOpen,
  groupSlug,
  textareaRef,
  fireTyping,
  onSend,
}: {
  body: string;
  setBody: (v: string) => void;
  sending: boolean;
  attached: Attached | null;
  setAttached: (v: Attached | null) => void;
  emojiOpen: boolean;
  setEmojiOpen: (v: boolean) => void;
  groupSlug?: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  fireTyping: (v: string) => void;
  onSend: (e?: React.FormEvent) => Promise<void>;
}) {
  const canSend = body.trim() || attached;

  return (
    <div className="border-t border-border bg-card p-3">
      {/* Emoji picker grid */}
      {emojiOpen && (
        <div className="mb-2 grid grid-cols-10 gap-0.5 rounded-xl border border-border bg-muted/30 p-2">
          {EMOJI_GRID.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => { setBody(body + em); setEmojiOpen(false); }}
              className="rounded-md p-1.5 text-lg transition-colors hover:bg-accent"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* Pill composer row */}
      <form
        onSubmit={onSend}
        className="flex items-end gap-1.5 rounded-2xl border border-border bg-muted/40 px-2 py-1.5"
      >
        {/* Attach (wraps MediaAttach trigger) */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          <MediaAttach value={attached} onChange={setAttached} />
        </div>

        {/* Emoji toggle */}
        <button
          type="button"
          onClick={() => setEmojiOpen(!emojiOpen)}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent",
            emojiOpen && "bg-accent text-foreground",
          )}
          aria-label="Emoji"
        >
          <Smile className="h-[18px] w-[18px] text-muted-foreground" />
        </button>

        {/* Textarea */}
        {groupSlug ? (
          <MentionTextarea
            value={body}
            onChange={(val) => { setBody(val); fireTyping(val); }}
            groupSlug={groupSlug}
            placeholder="Type a message… use @ to mention"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.defaultPrevented) {
                e.preventDefault();
                onSend();
              }
            }}
          />
        ) : (
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => { setBody(e.target.value); fireTyping(e.target.value); }}
            placeholder="Type a message…"
            rows={1}
            className="min-h-0 flex-1 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
          />
        )}

        {/* Send or Mic */}
        {canSend ? (
          <button
            type="submit"
            disabled={sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
            aria-label="Voice message"
          >
            <Mic className="h-[18px] w-[18px]" />
          </button>
        )}
      </form>
    </div>
  );
}
