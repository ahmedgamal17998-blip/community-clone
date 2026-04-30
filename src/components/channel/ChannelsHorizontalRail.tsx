"use client";

/**
 * Mobile-only horizontal channels rail.
 *
 * Replaces the desktop left sidebar on phones. Renders the same channel
 * rows but as a horizontally-scrolling pill list pinned just below the
 * group tabs. Hidden on `sm` and up where the desktop sidebar takes over.
 *
 * Active channel highlight + locked-channel paywall behaviour mirror
 * ChannelSidebar.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hash, Lock, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { openPaywall } from "@/components/access/PaywallPopup";

type ChannelRow = {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  kind: string;
  locked?: boolean;
};

type Props = {
  groupSlug: string;
  channels: ChannelRow[];
};

function KindIcon({ kind }: { kind: string }) {
  if (kind === "PRIVATE") return <Lock className="h-3.5 w-3.5 shrink-0" />;
  if (kind === "ANNOUNCEMENT")
    return <Megaphone className="h-3.5 w-3.5 shrink-0" />;
  return <Hash className="h-3.5 w-3.5 shrink-0" />;
}

export function ChannelsHorizontalRail({ groupSlug, channels }: Props) {
  const pathname = usePathname();
  const base = `/groups/${groupSlug}/channels`;
  const activeSlug = pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1).split("/")[0]
    : undefined;

  if (channels.length === 0) return null;

  return (
    <div className="lg:hidden -mx-3 sm:-mx-4 px-3 sm:px-4 mb-3 overflow-x-auto">
      <div className="flex items-center gap-1.5 pb-1">
        {channels.map((c) => {
          const active = c.slug === activeSlug;

          if (c.locked) {
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  openPaywall({
                    groupSlug,
                    resourceLabel: `#${c.slug}`,
                  })
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground/55 line-through decoration-muted-foreground/30"
                title="Subscribe to unlock"
              >
                {c.emoji ? (
                  <span className="text-sm leading-none opacity-60">
                    {c.emoji}
                  </span>
                ) : (
                  <KindIcon kind={c.kind} />
                )}
                <span className="max-w-[120px] truncate">{c.name}</span>
                <Lock className="h-3 w-3 opacity-70" />
              </button>
            );
          }

          return (
            <Link
              key={c.id}
              href={`${base}/${c.slug}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors",
                active
                  ? "bg-primary/15 font-semibold text-primary"
                  : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {c.emoji ? (
                <span className="text-sm leading-none">{c.emoji}</span>
              ) : (
                <KindIcon kind={c.kind} />
              )}
              <span className="max-w-[120px] truncate">{c.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
