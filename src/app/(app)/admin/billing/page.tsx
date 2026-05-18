/**
 * /admin/billing — Tenant plan + billing overview.
 * Plans are fetched live from the DB so any super-admin change
 * (price, limits, features, visibility) reflects instantly here.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPlanConfigs } from "@/server/plan-configs";
import type { Plan } from "@/lib/plans";

function formatPrice(cents: number): string {
  if (cents === 0) return "$0/mo";
  return `$${(cents / 100).toFixed(0)}/mo`;
}

export default async function AdminBillingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [tenant, planConfigs] = await Promise.all([
    db.tenant.findFirst({
      where: { ownerId: session.user.id },
      select: {
        id: true, plan: true, planStatus: true,
        currentMembers: true, currentGroups: true, currentCourses: true,
        memberLimit: true, groupLimit: true, courseLimit: true,
        stripeCustomerId: true, stripeSubscriptionId: true,
      },
    }),
    getPlanConfigs(),
  ]);
  if (!tenant) redirect("/admin/setup");

  const plan = tenant.plan as Plan;

  // Live config from DB — falls back to first plan if somehow missing
  const cfg = planConfigs.find((p) => p.plan === plan) ?? planConfigs[0];

  const usage = [
    { label: "Members",  current: tenant.currentMembers, limit: tenant.memberLimit,  icon: "👥" },
    { label: "Groups",   current: tenant.currentGroups,  limit: tenant.groupLimit,   icon: "📁" },
    { label: "Courses",  current: tenant.currentCourses, limit: tenant.courseLimit,  icon: "🎓" },
  ];

  // Only render plans the super-admin has set as visible
  const visiblePlans = planConfigs.filter((p) => p.isVisible);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing &amp; Plan</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your Nadi plan and usage.
        </p>
      </div>

      {/* ── Current plan card ── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Current plan</p>
            <p className="mt-1 text-xl font-bold">{cfg.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{formatPrice(cfg.monthlyPriceCents)}</p>
          </div>
          <div className="text-right">
            <span className={cn(
              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
              tenant.planStatus === "ACTIVE"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : "bg-destructive/10 text-destructive",
            )}>
              {tenant.planStatus}
            </span>
          </div>
        </div>

        {/* Usage meters */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          {usage.map((u) => {
            const pct = u.limit === -1 ? 0 : Math.min(100, Math.round((u.current / u.limit) * 100));
            return (
              <div key={u.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{u.icon} {u.label}</span>
                  <span className="font-medium">
                    {u.current} / {u.limit === -1 ? "∞" : u.limit}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pct >= 90 ? "bg-destructive" : "bg-primary",
                    )}
                    style={{ width: u.limit === -1 ? "10%" : `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Plan comparison grid ── */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Available plans
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {visiblePlans.map((pc) => {
            const isCurrent = pc.plan === plan;

            // Build feature lines from DB limits + extra feature strings
            const featureLines: string[] = [
              pc.maxGroups === -1
                ? "Unlimited groups"
                : `${pc.maxGroups} group${pc.maxGroups === 1 ? "" : "s"}`,
              pc.maxMembersPerGroup === -1
                ? "Unlimited members"
                : `Up to ${pc.maxMembersPerGroup} members`,
              pc.maxCourses === -1
                ? "Unlimited courses"
                : `${pc.maxCourses} course${pc.maxCourses === 1 ? "" : "s"}`,
              ...(pc.features ?? []),
            ];

            return (
              <div
                key={pc.plan}
                className={cn(
                  "rounded-2xl border p-5",
                  isCurrent ? "border-primary bg-primary/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{pc.label}</p>
                    <p className="text-lg font-bold">{formatPrice(pc.monthlyPriceCents)}</p>
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      Current
                    </span>
                  )}
                </div>
                <ul className="mt-4 space-y-2">
                  {featureLines.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {!isCurrent && pc.monthlyPriceCents > 0 && (
                  <Button className="mt-4 w-full gap-1.5" size="sm">
                    <Zap className="h-3.5 w-3.5" />
                    Upgrade to {pc.label}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Stripe billing integration coming soon. Contact us at{" "}
          <a href="mailto:support@nadi.app" className="text-primary hover:underline">
            support@nadi.app
          </a>{" "}
          to upgrade.
        </p>
      </div>
    </div>
  );
}
