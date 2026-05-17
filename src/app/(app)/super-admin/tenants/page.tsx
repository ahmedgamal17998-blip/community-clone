/**
 * /super-admin/tenants — Full tenant list with search + plan management.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSuperAdmin } from "@/server/super-admin";
import { format } from "date-fns";
import { SuperAdminTenantActions } from "@/components/admin/SuperAdminTenantActions";

export default async function SuperAdminTenantsPage({
  searchParams,
}: {
  searchParams: { q?: string; plan?: string; status?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isSuperAdmin(session.user.id))) redirect("/");

  const { q, plan, status } = searchParams;

  const tenants = await db.tenant.findMany({
    where: {
      ...(q ? {
        OR: [
          { name:  { contains: q, mode: "insensitive" } },
          { slug:  { contains: q, mode: "insensitive" } },
        ],
      } : {}),
      ...(plan   ? { plan }          : {}),
      ...(status ? { planStatus: status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      owner: { select: { email: true, name: true } },
      _count: { select: { paymentMethods: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">All workspaces on the platform.</p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or slug…"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <select name="plan" defaultValue={plan ?? ""} className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
          <option value="">All plans</option>
          {["STARTER","PRO","BUSINESS"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
          <option value="">All statuses</option>
          {["TRIAL","ACTIVE","PAST_DUE","CANCELED","SUSPENDED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="submit" className="rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          Filter
        </button>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Workspace","Owner","Plan","Status","Members","Groups","Created","Actions"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-4 last:pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="pl-4 pr-3 py-3">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.slug}.nadi.app</p>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground max-w-[150px] truncate">
                  {t.owner.name ?? t.owner.email}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {t.plan}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    t.planStatus === "ACTIVE" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : t.planStatus === "TRIAL" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {t.planStatus}
                    {t.planStatus === "TRIAL" && t.trialEndsAt && (
                      <> · {Math.max(0, Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / 86400000))}d</>
                    )}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{t.currentMembers}</td>
                <td className="px-3 py-3 text-muted-foreground">{t.currentGroups}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {format(new Date(t.createdAt), "dd MMM yy")}
                </td>
                <td className="pr-4 py-3">
                  <SuperAdminTenantActions tenantId={t.id} currentPlan={t.plan} currentStatus={t.planStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tenants.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No tenants found.</p>
        )}
      </div>
    </div>
  );
}
