/**
 * /admin/subscriptions — View + manage all member subscriptions.
 * Filter by status (PENDING_APPROVAL, ACTIVE, EXPIRED, CANCELED, REJECTED).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { format } from "date-fns";
import { Clock, Check, X, AlertCircle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SubscriptionApprovalButtons } from "@/components/admin/SubscriptionApprovalButtons";

const STATUS_CONFIG = {
  PENDING_APPROVAL: { label: "Pending",  color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
  ACTIVE:           { label: "Active",   color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: Check },
  EXPIRED:          { label: "Expired",  color: "bg-muted text-muted-foreground", icon: AlertCircle },
  CANCELED:         { label: "Canceled", color: "bg-muted text-muted-foreground", icon: Ban },
  REJECTED:         { label: "Rejected", color: "bg-destructive/10 text-destructive", icon: X },
};

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: { status?: string; group?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await db.tenant.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!tenant) redirect("/onboarding");

  const statusFilter = searchParams.status;
  const groupFilter  = searchParams.group;

  const subscriptions = await db.subscription.findMany({
    where: {
      group: { community: { tenantId: tenant.id } },
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(groupFilter  ? { groupId: groupFilter }  : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user:  { select: { id: true, name: true, email: true, image: true, handle: true } },
      group: { select: { id: true, name: true, slug: true } },
      plan:  { select: { name: true, priceCents: true, currency: true } },
      paymentMethod: { select: { type: true, label: true } },
      approvedBy:    { select: { name: true } },
    },
  });

  const statuses = ["PENDING_APPROVAL", "ACTIVE", "EXPIRED", "CANCELED", "REJECTED"] as const;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Review and manage member subscriptions across all groups.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/subscriptions"
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            !statusFilter ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          All
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/admin/subscriptions?status=${s}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {STATUS_CONFIG[s].label}
          </Link>
        ))}
      </div>

      {/* Table */}
      {subscriptions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">No subscriptions found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((sub) => {
            const cfg = STATUS_CONFIG[sub.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.EXPIRED;
            return (
              <div
                key={sub.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                {/* Member info */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {sub.user.image ? (
                    <img src={sub.user.image} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {(sub.user.name ?? sub.user.email ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{sub.user.name ?? sub.user.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sub.group.name} · {sub.plan.name} ·{" "}
                      {sub.plan.priceCents
                        ? `${(sub.plan.priceCents / 100).toFixed(0)} ${sub.plan.currency.toUpperCase()}`
                        : "Free"}
                    </p>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", cfg.color)}>
                    {cfg.label}
                  </span>
                  <span>{format(new Date(sub.createdAt), "dd MMM yyyy")}</span>
                  {sub.paymentMethod && (
                    <span className="truncate max-w-[120px]">{sub.paymentMethod.label}</span>
                  )}
                  {sub.paymentProofUrl && (
                    <a
                      href={sub.paymentProofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      View proof
                    </a>
                  )}
                  {sub.paymentRef && <span>Ref: {sub.paymentRef}</span>}
                </div>

                {/* Actions */}
                {sub.status === "PENDING_APPROVAL" && (
                  <SubscriptionApprovalButtons subscriptionId={sub.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
