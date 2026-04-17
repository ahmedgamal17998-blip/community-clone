/**
 * Group-level tabs: Discussion, Learning, Events, Members, About.
 * Client component — uses pathname to highlight the active tab.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = { slug: string };

export function GroupTabs({ slug }: Props) {
  const pathname = usePathname();
  const t = useTranslations("groups.tabs");

  const base = `/groups/${slug}`;
  const tabs = [
    { href: `${base}`,          label: t("discussion"), match: (p: string) => p === base },
    { href: `${base}/learning`, label: t("learning"),   match: (p: string) => p.startsWith(`${base}/learning`) },
    { href: `${base}/events`,   label: t("events"),     match: (p: string) => p.startsWith(`${base}/events`) },
    { href: `${base}/members`,  label: t("members"),    match: (p: string) => p.startsWith(`${base}/members`) },
    { href: `${base}/about`,    label: t("about"),      match: (p: string) => p.startsWith(`${base}/about`) },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Group sections">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative inline-flex shrink-0 items-center px-3 py-2 text-sm transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
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
