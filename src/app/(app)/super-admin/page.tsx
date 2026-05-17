/**
 * /super-admin — Platform overview for Nadi (Salezprint LLC).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSuperAdmin } from "@/server/super-admin";
import { format } from "date-fns";
import { Building2, Users, TrendingUp, AlertCircle } from "lucide-react";

export default async function SuperAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isSuperAdmin(session.user.id))) redirect("/");

  const [
    tenantCount,
    userCount,
    pendingApprovals,
    trialTenants,
    recentTenants,
  ] = await Promise.all([
    db.tenant.count(),
    db.user.count(),
    db.subscription.count({ where: { status: "PENDING_APPROVAL" } }),
    db.tenant.count({ where: { planStatus: "TRIAL" } }),
    db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, name: true, slug: true, plan: true, planStatus: true,
        createdAt: true,
        owner: { select: { email: true, name: true } },
        currentMembers: true, currentGroups: true,
      },
    }),
  ]);

  // Revenue estimate (Nadi's own subscriptions — PRO/BUSINESS paying tenants)
  const payingTenants = await db.tenant.count({
    where: { planStatus: "ACTIVE", plan: { in: ["PRO", "BUSINESS"] } },
  });

  const stats = [
    { label: "Total tenants",     value: tenantCount,      icon: Building2,   sub: `${trialTenants} on trial` },
    { label: "Total users",       value: userCount,        icon: Users,       sub: "across all tenants" },
    { label: "Paying tenants",    value: payingTenants,    icon: TrendingUp,  sub: "PRO + BUSINESS active" },
    { label: "Pending approvals", value: pendingApprovals, icon: AlertCircle, sub: "need action", urgent: pendingApprovals > 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Nadi — operated by Salezprint LLC
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-2xl border bg-card p-4 shadow-sm ${
              s.urgent ? "border-destructive/40 bg-destructive/5" : "border-border"
            }`}
          >
            <s.icon className={`mb-2 h-5 w-5 ${s.urgent ? "text-destructive" : "text-muted-foreground"}`} />
            <p className={`text-2xl font-bold ${s.urgent ? "text-destructive" : ""}`}>{s.value}</p>
            <p className="mt-0.5 text-xs font-medium">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent tenants */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent workspaces
          </h2>
          <Link href="/super-admin/tenants" className="text-xs text-primary hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Owner</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Groups</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentTenants.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/super-admin/tenants/${t.id}`} className="block hover:text-primary transition-colors">
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.slug}.nadi.app</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{t.owner.name ?? t.owner.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      t.planStatus === "TRIAL" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        : t.plan === "BUSINESS" ? "bg-amber-100 text-amber-700"
                        : t.plan === "PRO" ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {t.planStatus === "TRIAL" ? "Trial" : t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{t.currentMembers}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{t.currentGroups}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {format(new Date(t.createdAt), "dd MMM yy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
