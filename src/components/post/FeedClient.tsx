"use client";

/**
 * Infinite-scroll loader. Renders additional pages after the SSR'd first page
 * by calling `/api/feed`. Uses IntersectionObserver on a sentinel row.
 *
 * Intentionally simple: no optimistic insertion, no realtime. M4b will layer
 * Pusher on top to push new posts into this list without a refetch.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Pin } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { formatRelative } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type FeedItem = {
  id: string;
  title: string | null;
  body: string;
  mediaUrls: string[];
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
  authorId: string;
  author: {
    id: string;
    name: string | null;
    handle: string;
    image: string | null;
  };
  channel: {
    id: string;
    slug: string;
    name: string;
    kind: string;
    group: { slug: string };
  };
};

type Props = {
  scope: { groupId?: string; channelId?: string };
  initialCursor: string | null;
  hideChannelCrumb?: boolean;
};

export function FeedClient({ scope, initialCursor, hideChannelCrumb }: Props) {
  const locale = useLocale();
  const t = useTranslations("posts.card");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialCursor === null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || done || !cursor) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scope.groupId) params.set("groupId", scope.groupId);
      if (scope.channelId) params.set("channelId", scope.channelId);
      params.set("cursor", cursor);
      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) {
        setDone(true);
        return;
      }
      const data: { items: FeedItem[]; nextCursor: string | null } = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      if (!data.nextCursor) setDone(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, done, loading, scope.channelId, scope.groupId]);

  useEffect(() => {
    if (!sentinelRef.current || done) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, done]);

  return (
    <>
      {items.map((p) => (
        <article
          key={p.id}
          className={cn(
            "rounded-xl border bg-card p-4",
            p.pinned ? "border-primary/40 bg-primary/5" : "border-border",
          )}
        >
          <header className="flex items-start gap-3">
            <Link href={`/profile/${p.author.handle}`} className="shrink-0">
              <Avatar>
                {p.author.image ? (
                  <AvatarImage src={p.author.image} alt={p.author.name ?? ""} />
                ) : null}
                <AvatarFallback>{initialsFrom(p.author.name)}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <Link
                  href={`/profile/${p.author.handle}`}
                  className="font-semibold hover:underline"
                >
                  {p.author.name ?? p.author.handle}
                </Link>
                <span className="text-muted-foreground">@{p.author.handle}</span>
                <span className="text-muted-foreground" aria-hidden>·</span>
                <time className="text-muted-foreground" dateTime={p.createdAt}>
                  {formatRelative(p.createdAt, locale)}
                </time>
                {!hideChannelCrumb ? (
                  <>
                    <span className="text-muted-foreground" aria-hidden>·</span>
                    <Link
                      href={`/groups/${p.channel.group.slug}/channels/${p.channel.slug}`}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {t("inChannel", { channel: p.channel.name })}
                    </Link>
                  </>
                ) : null}
                {p.editedAt ? (
                  <span className="text-xs italic text-muted-foreground">
                    ({t("edited")})
                  </span>
                ) : null}
                {p.pinned ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <Pin className="h-3 w-3" />
                    {t("pinned")}
                  </span>
                ) : null}
              </div>
            </div>
          </header>
          {p.title ? (
            <h2 className="mt-3 text-lg font-semibold leading-snug">{p.title}</h2>
          ) : null}
          <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {p.body}
          </div>
          {p.mediaUrls.length > 0 ? (
            <div
              className={cn(
                "mt-3 grid gap-2",
                p.mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2",
              )}
            >
              {p.mediaUrls.slice(0, 4).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt=""
                  className="h-48 w-full rounded-lg object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : null}
        </article>
      ))}

      <div ref={sentinelRef} aria-hidden className="h-8" />
      {loading ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {t("loading")}
        </p>
      ) : null}
    </>
  );
}
