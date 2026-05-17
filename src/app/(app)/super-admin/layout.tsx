/**
 * /super-admin — Platform super-admin shell.
 *
 * Only users listed in SUPER_ADMIN_EMAILS (or SUPER_ADMIN_ID) can access this section.
 * Intentionally separate from /admin to avoid accidental tenant data bleed.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/super-admin";
import {
  LayoutDashboard, Users, Building2, CreditCard,
  Settings, ShieldAlert,
} from "lucide-react";
import { AdminNavLink } from "@/components/admin/AdminNavLink";

const NAV = [
  { href: "/super-admin",          label: "Overview",  icon: LayoutDashboard },
  { href: "/super-admin/tenants",  label: "Tenants",   icon: Building2 },
  { href: "/super-admin/users",    label: "Users",     icon: Users },
  { href: "/super-admin/revenue",  label: "Revenue",   icon: CreditCard },
  { href: "/super-admin/settings", label: "Settings",  icon: Settings },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!(await isSuperAdmin(session.user.id))) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-0 px-3 py-6 sm:flex-row sm:gap-8 sm:px-4">
      {/* Sidebar */}
      <aside className="mb-4 w-full shrink-0 sm:mb-0 sm:w-56">
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Super Admin</p>
            <p className="text-xs text-muted-foreground">Platform control</p>
          </div>
        </div>
        <nav className="space-y-0.5">
          {NAV.map((item) => (
            <AdminNavLink key={item.href} item={item} />
          ))}
        </nav>
        <div className="mt-4 border-t border-border pt-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            ← Back to admin
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
