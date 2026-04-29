/**
 * Channel list rail. Shown inside the group shell for ACTIVE members.
 * Client component so it can highlight the active channel via usePathname.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Hash, Lock, Megaphone, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { openPaywall } from "@/components/access/PaywallPopup";

type ChannelRow = {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  kind: string;
  /** Set true when the viewer has been explicitly locked out of this channel. */
  locked?: boolean;
};

type Props = {
  groupSlug: string;
  groupId?: string;
  channels: ChannelRow[];
  canManage: boolean;
};

function KindIcon({ kind }: { kind: string }) {
  if (kind === "PRIVATE") return <Lock className="h-4 w-4 shrink-0" />;
  if (kind === "ANNOUNCEMENT") return <Megaphone className="h-4 w-4 shrink-0" />;
  return <Hash className="h-4 w-4 shrink-0" />;
}

export function ChannelSidebar({ groupSlug, groupId, channels, canManage }: Props) {
  const t = useTranslations("channels");
  const pathname = usePathname();
  const base = `/groups/${groupSlug}/channels`;
  const [unread, setUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    async function fetchUnread() {
      try {
        const res = await fetch(
          `/api/chat/channel-unread?groupId=${encodeURIComponent(groupId!)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { map: Record<string, number> };
        if (!cancelled) setUnread(data.map ?? {});
      } catch {
        /* ignore */
      }
    }
    fetchUnread();
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") fetchUnread();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [groupId]);

  // Extract the active channel slug from the path, if any.
  const activeChannelSlug = pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1).split("/")[0]
    : undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between px-2 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("sidebarTitle")}
        </h3>
        {canManage ? (
          <Link
            href={`${base}/new`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("addChannel")}
          >
            <Plus className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {channels.length === 0 ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-0.5">
          {channels.map((c) => {
            const active = c.slug === activeChannelSlug;

            // Locked channels: render as a clickable button that opens the
            // paywall popup. The row is dimmed + has a lock badge so the
            // visual lock is obvious; clicking explains why.
            if (c.locked) {
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      openPaywall({
                        groupSlug,
                        resourceLabel: `#${c.slug}`,
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground/55 transition-colors hover:bg-accent/30"
                    title="Subscribe to unlock this channel"
                    aria-label={`Locked channel ${c.name}. Click to upgrade.`}
                  >
                    {c.emoji ? (
                      <span className="text-base leading-none opacity-60">
                        {c.emoji}
                      </span>
                    ) : (
                      <KindIcon kind={c.kind} />
                    )}
                    <span className="truncate line-through decoration-muted-foreground/30">
                      {c.name}
                    </span>
                    <Lock className="ms-auto h-3 w-3 shrink-0 opacity-70" />
                  </button>
                </li>
              );
            }

            return (
              <li key={c.id}>
                <Link
                  href={`${base}/${c.slug}`}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {c.emoji ? (
                    <span className="text-base leading-none">{c.emoji}</span>
                  ) : (
                    <KindIcon kind={c.kind} />
                  )}
                  <span className="truncate">{c.name}</span>
                  {unread[c.id] > 0 ? (
                    <span className="ms-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                      {unread[c.id] > 99 ? "99+" : unread[c.id]}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
