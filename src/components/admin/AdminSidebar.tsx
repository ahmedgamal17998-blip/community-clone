"use client";

/**
 * Admin dashboard sidebar — sectioned, iconified, with active highlight.
 * Professional + simple — no clutter.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Hash,
  ShieldCheck,
  CreditCard,
  Megaphone,
  Sparkles,
  Palette,
  Settings,
  MessageSquare,
  CalendarClock,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

// Grouped sections so the sidebar reads as a proper dashboard.
const SECTIONS: Array<{ title: string; items: Item[] }> = [
  {
    title: "",
    items: [{ href: "", label: "Overview", icon: LayoutDashboard }],
  },
  {
    title: "People",
    items: [
      { href: "/members", label: "Members", icon: Users },
      { href: "/requests", label: "Requests", icon: UserPlus },
      { href: "/team", label: "Admin Team", icon: ShieldCheck },
    ],
  },
  {
    title: "Spaces",
    items: [
      { href: "/channels", label: "Channels", icon: Hash },
      { href: "/chats", label: "Group Chats", icon: MessageSquare },
      { href: "/booking", label: "Bookings", icon: CalendarClock },
    ],
  },
  {
    title: "Monetization",
    items: [{ href: "/plans", label: "Plans", icon: CreditCard }],
  },
  {
    title: "Engagement",
    items: [
      { href: "/announcements",  label: "Announcements",  icon: Megaphone },
      { href: "/onboarding",     label: "Onboarding",     icon: Sparkles  },
      { href: "/notifications",  label: "Notifications",  icon: Bell      },
    ],
  },
  {
    title: "Brand",
    items: [
      { href: "/branding", label: "Branding", icon: Palette },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function AdminSidebar({ groupSlug }: { groupSlug: string }) {
  const pathname = usePathname();
  const base = `/groups/${groupSlug}/admin`;

  const isActive = (href: string) => {
    const full = `${base}${href}`;
    if (href === "") return pathname === base;
    return pathname === full || pathname.startsWith(`${full}/`);
  };

  return (
    <nav className="rounded-xl border border-border bg-card p-2">
      {SECTIONS.map((section, i) => (
        <div key={i} className={cn(i > 0 && "mt-3 border-t border-border pt-3")}>
          {section.title && (
            <h3 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {section.title}
            </h3>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={`${base}${item.href}`}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
