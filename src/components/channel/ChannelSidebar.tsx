/**
 * Channel list rail. Shown inside the group shell for ACTIVE members.
 * Client component so it can highlight the active channel via usePathname.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Hash, Lock, Megaphone, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type ChannelRow = {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  kind: string;
};

type Props = {
  groupSlug: string;
  channels: ChannelRow[];
  canManage: boolean;
};

function KindIcon({ kind }: { kind: string }) {
  if (kind === "PRIVATE") return <Lock className="h-4 w-4 shrink-0" />;
  if (kind === "ANNOUNCEMENT") return <Megaphone className="h-4 w-4 shrink-0" />;
  return <Hash className="h-4 w-4 shrink-0" />;
}

export function ChannelSidebar({ groupSlug, channels, canManage }: Props) {
  const t = useTranslations("channels");
  const pathname = usePathname();
  const base = `/groups/${groupSlug}/channels`;

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
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
