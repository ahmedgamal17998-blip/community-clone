"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = {
  groupSlug: string;
  channelSlug: string;
  /** When false, the Chat tab is hidden — channel is posts-only. */
  chatEnabled?: boolean;
};

export function ChannelTabs({
  groupSlug,
  channelSlug,
  chatEnabled = true,
}: Props) {
  const pathname = usePathname();
  const t = useTranslations("channels.tabs");

  const base = `/groups/${groupSlug}/channels/${channelSlug}`;
  const tabs = [
    { href: base, label: t("posts"), match: (p: string) => p === base, tour: "channel-tab-posts" },
    ...(chatEnabled
      ? [
          {
            href: `${base}/chat`,
            label: t("chat"),
            match: (p: string) => p.startsWith(`${base}/chat`),
            tour: "channel-tab-chat",
          },
        ]
      : []),
  ];

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Channel sections">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-tour={tab.tour}
            className={cn(
              "relative inline-flex shrink-0 items-center px-3 py-2 text-sm transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
