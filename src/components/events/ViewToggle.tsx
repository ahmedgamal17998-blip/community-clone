"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { isoDate, addDays, addMonths } from "@/lib/calendar";

type View = "day" | "week" | "month";

export function ViewToggle({
  view,
  date,
}: {
  view: View;
  date: Date;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const build = (v: View, d: Date) => {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.set("view", v);
    sp.set("date", isoDate(d));
    return `${pathname}?${sp.toString()}`;
  };

  const today = new Date();
  const prev = () => {
    if (view === "day") return addDays(date, -1);
    if (view === "week") return addDays(date, -7);
    return addMonths(date, -1);
  };
  const next = () => {
    if (view === "day") return addDays(date, 1);
    if (view === "week") return addDays(date, 7);
    return addMonths(date, 1);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
        {(["day", "week", "month"] as View[]).map((v) => (
          <Link
            key={v}
            href={build(v, date)}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
              v === view
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Link
          href={build(view, prev())}
          className="rounded-md border border-border bg-card px-2 py-1 text-sm hover:bg-muted"
          aria-label="Previous"
        >
          ‹
        </Link>
        <Link
          href={build(view, today)}
          className="rounded-md border border-border bg-card px-3 py-1 text-xs font-medium hover:bg-muted"
        >
          Today
        </Link>
        <Link
          href={build(view, next())}
          className="rounded-md border border-border bg-card px-2 py-1 text-sm hover:bg-muted"
          aria-label="Next"
        >
          ›
        </Link>
      </div>
    </div>
  );
}
