/**
 * /admin — Tenant admin shell.
 *
 * Requires the user to own at least one Tenant.
 * Wraps all /admin/* pages with the side navigation.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  LayoutDashboard, CreditCard, Users,
  Settings, Receipt, Building2, ChevronRight,
} from "lucide-react";
import { AdminNavLink } from "@/components/admin/AdminNavLink";

const NAV = [
  { href: "/admin",                 label: "Overview",        icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { href: "/admin/subscriptions",   label: "Subscriptions",   icon: <Users            className="h-4 w-4 shrink-0" /> },
  { href: "/admin/payment-methods", label: "Payment Methods", icon: <CreditCard       className="h-4 w-4 shrink-0" /> },
  { href: "/admin/billing",         label: "Billing & Plan",  icon: <Receipt          className="h-4 w-4 shrink-0" /> },
  { href: "/admin/settings",        label: "Settings",        icon: <Settings         className="h-4 w-4 shrink-0" /> },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await db.tenant.findFirst({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, plan: true, planStatus: true },
  });

  if (!tenant) redirect("/onboarding");

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-0 px-3 py-6 sm:flex-row sm:gap-8 sm:px-4">
      {/* Sidebar */}
      <aside className="mb-4 w-full shrink-0 sm:mb-0 sm:w-56">
        {/* Workspace badge */}
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            {tenant.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{tenant.name}</p>
            <p className="truncate text-xs text-muted-foreground capitalize">
              {tenant.plan.toLowerCase()} · {tenant.planStatus.toLowerCase()}
            </p>
          </div>
        </div>

        <nav className="space-y-0.5">
          {NAV.map((item) => (
            <AdminNavLink key={item.href} item={item} />
          ))}
        </nav>

        <div className="mt-4 border-t border-border pt-4">
          <Link
            href="/owner/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Building2 className="h-3.5 w-3.5" />
            All communities
            <ChevronRight className="ml-auto h-3 w-3" />
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
