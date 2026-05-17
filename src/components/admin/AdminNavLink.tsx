"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode; // pre-rendered JSX — never pass the component function from a Server Component
}

export function AdminNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active =
    item.href === "/admin"
      ? pathname === "/admin"
      : item.href === "/super-admin"
      ? pathname === "/super-admin"
      : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}
