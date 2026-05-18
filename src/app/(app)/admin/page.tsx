/**
 * /admin — Tenant overview dashboard.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { Users, FolderOpen, CreditCard, Clock, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function AdminOverviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await db.tenant.findFirst({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      groups: {
        where: { deletedAt: null },
        select: { id: true, name: true, slug: true, isPaid: true,
          _count: { select: { memberships: { where: { state: "ACTIVE" } } } } },
      },
      paymentMethods: { where: { active: true }, select: { id: true } },
    },
  });

  if (!tenant) redirect("/admin/setup");

  // Pending approvals count
  const pendingCount = await db.subscription.count({
    where: {
      status: "PENDING_APPROVAL",
      group: { tenantId: tenant.id },
    },
  });

  // Recent subscriptions (last 30 days)
  const recentSubCount = await db.subscription.count({
    where: {
      status: "ACTIVE",
      startedAt: { gte: new Date(Date.now() - 30 * 86400000) },
      group: { tenantId: tenant.id },
    },
  });

  const groups = tenant.groups;
  const totalMembers = groups.reduce((acc, g) => acc + g._count.memberships, 0);
  const trialDaysLeft = tenant.trialEndsAt
    ? Math.max(0, Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86400000))
    : null;

  const stats = [
    { label: "Total members", value: totalMembers.toLocaleString(), icon: Users, href: "/admin/subscriptions" },
    { label: "Groups",        value: groups.length.toString(),       icon: FolderOpen, href: null },
    { label: "Payment methods", value: tenant.paymentMethods.length.toString(), icon: CreditCard, href: "/admin/payment-methods" },
    { label: "New this month", value: recentSubCount.toString(),     icon: CheckCircle2, href: "/admin/subscriptions" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your workspace, payments and members.
        </p>
      </div>

      {/* Trial / plan alert */}
      {tenant.planStatus === "TRIAL" && (
        <div className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          trialDaysLeft !== null && trialDaysLeft <= 3
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : "border-amber-300/50 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
        )}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {trialDaysLeft !== null
                ? `Free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`
                : "Free trial active"}
            </p>
            <p className="mt-0.5 text-xs opacity-80">
              Upgrade to Pro or Business to continue after your trial ends.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/admin/billing">Upgrade</Link>
          </Button>
        </div>
      )}

      {/* Pending approvals banner */}
      {pendingCount > 0 && (
        <Link
          href="/admin/subscriptions?status=PENDING_APPROVAL"
          className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              {pendingCount} pending payment approval{pendingCount !== 1 ? "s" : ""}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-primary" />
        </Link>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <s.icon className="mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Groups list */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Groups
        </h2>
        <div className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No groups yet.</p>
          ) : (
            groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g._count.memberships} active member{g._count.memberships !== 1 ? "s" : ""}
                    {g.isPaid && <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">PAID</span>}
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/groups/${g.slug}/admin`}>Manage</Link>
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
