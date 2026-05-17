/**
 * /super-admin/revenue — Platform revenue overview.
 * Shows estimated MRR, plan distribution, and recent paid invoices.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSuperAdmin } from "@/server/super-admin";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { DollarSign, TrendingUp, Users, Building2 } from "lucide-react";
import Link from "next/link";

// Nadi plan pricing (cents / month)
const PLAN_PRICE: Record<string, number> = {
  STARTER:  0,
  PRO:      2900,
  BUSINESS: 7900,
};

export default async function SuperAdminRevenuePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isSuperAdmin(session.user.id))) redirect("/");

  const now = new Date();

  const [
    planBreakdown,
    recentPaidInvoices,
    newTenantsThisMonth,
    totalUsers,
    activeMembers,
  ] = await Promise.all([
    // Plan distribution
    db.tenant.groupBy({
      by: ["plan", "planStatus"],
      _count: { id: true },
    }),

    // Recent paid invoices
    db.invoice.findMany({
      where: { status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 10,
      include: {
        tenant: { select: { id: true, name: true, plan: true } },
      },
    }),

    // New tenants this month
    db.tenant.count({
      where: {
        createdAt: {
          gte: startOfMonth(now),
          lte: endOfMonth(now),
        },
      },
    }),

    // Total users
    db.user.count(),

    // Active member subscriptions
    db.subscription.count({ where: { status: "ACTIVE" } }),
  ]);

  // Calculate estimated MRR
  let mrrCents = 0;
  const planCounts: Record<string, number> = { STARTER: 0, PRO: 0, BUSINESS: 0 };

  for (const row of planBreakdown) {
    planCounts[row.plan] = (planCounts[row.plan] ?? 0) + row._count.id;
    if (row.planStatus === "ACTIVE") {
      mrrCents += (PLAN_PRICE[row.plan] ?? 0) * row._count.id;
    }
  }

  const arrCents = mrrCents * 12;

  // Monthly new tenants (last 6 months)
  const monthlyData = await Promise.all(
    Array.from({ length: 6 }, (_, i) => {
      const month = subMonths(now, 5 - i);
      return db.tenant
        .count({
          where: {
            createdAt: {
              gte: startOfMonth(month),
              lte: endOfMonth(month),
            },
          },
        })
        .then((count) => ({ label: format(month, "MMM"), count }));
    })
  );

  // Paid invoice revenue this month
  const invoiceRevenueThisMonth = await db.invoice.aggregate({
    where: {
      status: "PAID",
      paidAt: { gte: startOfMonth(now), lte: endOfMonth(now) },
    },
    _sum: { amountCents: true },
  });

  const invoiceRevThisMonth = invoiceRevenueThisMonth._sum.amountCents ?? 0;

  const maxBarCount = Math.max(...monthlyData.map((d) => d.count), 1);

  const planColors: Record<string, string> = {
    STARTER:  "bg-muted",
    PRO:      "bg-primary",
    BUSINESS: "bg-amber-500",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Platform revenue overview for Nadi.</p>
      </div>

      {/* Top KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label:   "Est. MRR",
            value:   `$${(mrrCents / 100).toFixed(0)}`,
            sub:     "monthly recurring revenue",
            icon:    DollarSign,
            color:   "text-green-600",
          },
          {
            label:   "Est. ARR",
            value:   `$${(arrCents / 100).toFixed(0)}`,
            sub:     "annualised run rate",
            icon:    TrendingUp,
            color:   "text-primary",
          },
          {
            label:   "Invoice rev. (month)",
            value:   `$${(invoiceRevThisMonth / 100).toFixed(2)}`,
            sub:     "collected this month",
            icon:    DollarSign,
            color:   "text-amber-600",
          },
          {
            label:   "Total users",
            value:   totalUsers,
            sub:     `${activeMembers} active subs`,
            icon:    Users,
            color:   "",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <s.icon className={`mb-2 h-5 w-5 ${s.color || "text-muted-foreground"}`} />
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="mt-0.5 text-xs font-medium">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Two columns: plan breakdown + growth chart */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">

        {/* Plan distribution */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Plan distribution</h2>
          {(["STARTER", "PRO", "BUSINESS"] as const).map((plan) => {
            const count  = planCounts[plan] ?? 0;
            const total  = Object.values(planCounts).reduce((a, b) => a + b, 0);
            const pct    = total === 0 ? 0 : Math.round((count / total) * 100);
            return (
              <div key={plan}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{plan}</span>
                  <span className="text-muted-foreground">
                    {count} workspaces · ${((PLAN_PRICE[plan] / 100) * count).toFixed(0)}/mo
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${planColors[plan]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{pct}%</p>
              </div>
            );
          })}

          {/* Status breakdown */}
          <div className="border-t border-border pt-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">By status</p>
            {planBreakdown
              .reduce<{ status: string; count: number }[]>((acc, row) => {
                const existing = acc.find((x) => x.status === row.planStatus);
                if (existing) existing.count += row._count.id;
                else acc.push({ status: row.planStatus, count: row._count.id });
                return acc;
              }, [])
              .sort((a, b) => b.count - a.count)
              .map(({ status, count }) => (
                <div key={status} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{status}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Monthly new tenants */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">New workspaces (6 months)</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              +{newTenantsThisMonth} this month
            </span>
          </div>
          {/* Bar chart */}
          <div className="flex h-28 items-end gap-2 pt-2">
            {monthlyData.map(({ label, count }) => (
              <div key={label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-muted-foreground">{count}</span>
                <div
                  className="w-full rounded-t-md bg-primary/80 transition-all"
                  style={{ height: `${maxBarCount === 0 ? 4 : Math.max(4, (count / maxBarCount) * 80)}px` }}
                />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="border-t border-border pt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            {Object.values(planCounts).reduce((a, b) => a + b, 0)} total workspaces on platform
          </div>
        </div>
      </div>

      {/* Recent paid invoices */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent paid invoices</h2>
        {recentPaidInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paid invoices yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Workspace", "Plan", "Amount", "Paid on"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentPaidInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="pl-4 pr-3 py-3">
                      <Link href={`/super-admin/tenants/${inv.tenant.id}`} className="font-medium hover:text-primary transition-colors text-sm">
                        {inv.tenant.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {inv.tenant.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-600">
                      ${(inv.amountCents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {inv.paidAt ? format(new Date(inv.paidAt), "dd MMM yyyy") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
