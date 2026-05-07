/**
 * Group-level tabs: Discussion, Learning, Events, Members, About.
 * Client component — uses pathname to highlight the active tab.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  /** When true (admin/owner), the Members tab is shown. Members can't see it. */
  canManage?: boolean;
};

export function GroupTabs({ slug, canManage = false }: Props) {
  const pathname = usePathname();
  const t = useTranslations("groups.tabs");

  const base = `/groups/${slug}`;
  // `tour` is the data-tour id used by the M21 onboarding tour to highlight
  // the matching tab. Defined in src/lib/tour-targets.ts.
  const tabs = [
    { href: `${base}`,          label: t("discussion"), tour: "tab-discussion", match: (p: string) => p === base },
    { href: `${base}/learning`, label: t("learning"),   tour: "tab-learning",   match: (p: string) => p.startsWith(`${base}/learning`) },
    { href: `${base}/events`,   label: t("events"),     tour: "tab-events",     match: (p: string) => p.startsWith(`${base}/events`) },
    { href: `${base}/leaderboard`, label: t("leaderboard"), tour: "tab-leaderboard", match: (p: string) => p.startsWith(`${base}/leaderboard`) },
    // Members tab is admin-only — regular members don't see who's in the group.
    ...(canManage
      ? [{ href: `${base}/members`,  label: t("members"),    tour: "tab-members", match: (p: string) => p.startsWith(`${base}/members`) }]
      : []),
    { href: `${base}/about`,    label: t("about"),      tour: "tab-about", match: (p: string) => p.startsWith(`${base}/about`) },
  ];

  return (
    <nav
      data-tour="groups-tabs"
      className="flex gap-1 overflow-x-auto"
      aria-label="Group sections"
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-tour={tab.tour}
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
