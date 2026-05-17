/**
 * /super-admin/tenants/[tenantId] — Full owner / workspace detail view.
 * Shows plan info, usage, groups, members, and recent subscription activity.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSuperAdmin } from "@/server/super-admin";
import { format } from "date-fns";
import { ArrowLeft, Users, Layers, BookOpen, Mail, Calendar, CreditCard } from "lucide-react";
import { SuperAdminTenantActions } from "@/components/admin/SuperAdminTenantActions";

export default async function TenantDetailPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isSuperAdmin(session.user.id))) redirect("/");

  const tenant = await db.tenant.findUnique({
    where: { id: params.tenantId },
    include: {
      owner: { select: { id: true, name: true, email: true, createdAt: true, image: true } },
      paymentMethods: { select: { id: true, type: true, label: true, active: true } },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, amountCents: true, currency: true, status: true, createdAt: true, paidAt: true, description: true },
      },
      communities: {
        include: {
          groups: {
            select: {
              id: true, name: true, slug: true, visibility: true, isPaid: true, priceCents: true,
              _count: { select: { memberships: { where: { state: "ACTIVE" } } } },
            },
          },
        },
      },
    },
  });

  if (!tenant) notFound();

  // Recent member subscriptions across all groups in this tenant
  const groupIds = tenant.communities.flatMap((c) => c.groups.map((g) => g.id));
  const recentSubs = groupIds.length
    ? await db.subscription.findMany({
        where: { groupId: { in: groupIds } },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: {
          user: { select: { name: true, email: true } },
          group: { select: { name: true } },
          plan: { select: { name: true, priceCents: true, currency: true } },
        },
      })
    : [];

  const usagePct = (current: number, limit: number) =>
    limit === 0 ? 0 : Math.min(100, Math.round((current / limit) * 100));

  const statusColor: Record<string, string> = {
    ACTIVE:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    TRIAL:     "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    SUSPENDED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    PAST_DUE:  "bg-orange-100 text-orange-800",
    CANCELED:  "bg-muted text-muted-foreground",
  };

  const subStatusColor: Record<string, string> = {
    ACTIVE:           "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    PENDING_APPROVAL: "bg-amber-100 text-amber-800",
    EXPIRED:          "bg-muted text-muted-foreground",
    CANCELED:         "bg-muted text-muted-foreground",
    REJECTED:         "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/super-admin/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All tenants
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{tenant.slug}.nadi.app</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${statusColor[tenant.planStatus] ?? "bg-muted text-muted-foreground"}`}>
            {tenant.planStatus}
          </span>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {tenant.plan}
          </span>
          <SuperAdminTenantActions
            tenantId={tenant.id}
            currentPlan={tenant.plan}
            currentStatus={tenant.planStatus}
          />
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Owner card */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Owner</h2>
          <div className="flex items-center gap-3">
            {tenant.owner.image ? (
              <img src={tenant.owner.image} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {(tenant.owner.name ?? tenant.owner.email ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium">{tenant.owner.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{tenant.owner.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />{tenant.billingEmail ?? tenant.owner.email}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />Joined {format(new Date(tenant.createdAt), "dd MMM yyyy")}
            </span>
          </div>
          {tenant.trialEndsAt && tenant.planStatus === "TRIAL" && (
            <p className="text-xs text-amber-600">
              Trial ends {format(new Date(tenant.trialEndsAt), "dd MMM yyyy")} (
              {Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400000))} days left)
            </p>
          )}
        </div>

        {/* Usage card */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usage</h2>
          {[
            { label: "Members", icon: Users, current: tenant.currentMembers, limit: tenant.memberLimit },
            { label: "Groups",  icon: Layers, current: tenant.currentGroups,  limit: tenant.groupLimit },
            { label: "Courses", icon: BookOpen, current: tenant.currentCourses, limit: tenant.courseLimit },
          ].map(({ label, icon: Icon, current, limit }) => {
            const pct = usagePct(current, limit);
            return (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Icon className="h-3 w-3" />{label}
                  </span>
                  <span className={pct >= 90 ? "font-semibold text-destructive" : "text-muted-foreground"}>
                    {current} / {limit === 0 ? "∞" : limit}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {/* Payment methods */}
          <div className="pt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CreditCard className="h-3 w-3" />
            {tenant.paymentMethods.filter((p) => p.active).length} active payment method(s)
          </div>
        </div>
      </div>

      {/* Groups */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Groups</h2>
        {tenant.communities.flatMap((c) => c.groups).length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Group", "Visibility", "Pricing", "Active Members"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenant.communities.flatMap((c) =>
                  c.groups.map((g) => (
                    <tr key={g.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="pl-4 pr-3 py-3">
                        <p className="font-medium">{g.name}</p>
                        <p className="text-xs text-muted-foreground">/{g.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
                          {g.visibility}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {g.isPaid ? `${((g.priceCents ?? 0) / 100).toFixed(2)} USD/period` : "Free"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {g._count.memberships}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent subscriptions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent member subscriptions
        </h2>
        {recentSubs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Member", "Group", "Plan", "Amount", "Status", "Date"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSubs.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="pl-4 pr-3 py-3">
                      <p className="font-medium text-xs">{s.user.name ?? s.user.email}</p>
                      <p className="text-[10px] text-muted-foreground">{s.user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.group.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.plan.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.amountPaid ? `${(s.amountPaid / 100).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${subStatusColor[s.status] ?? "bg-muted text-muted-foreground"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(s.createdAt), "dd MMM yy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent invoices */}
      {tenant.invoices.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent invoices (Nadi billing)
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Description", "Amount", "Status", "Created"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenant.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="pl-4 pr-3 py-3 text-xs">{inv.description ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {(inv.amountCents / 100).toFixed(2)} {inv.currency.toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        inv.status === "PAID" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(inv.createdAt), "dd MMM yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
