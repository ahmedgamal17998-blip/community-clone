/**
 * /super-admin/invoices — Platform invoice management.
 * Lists all Nadi billing invoices. Super-admin can mark as paid or void.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSuperAdmin } from "@/server/super-admin";
import { format } from "date-fns";
import Link from "next/link";
import { InvoiceActions } from "@/components/admin/InvoiceActions";

const STATUS_TABS = ["ALL", "PENDING", "PAID", "VOID", "UNCOLLECTIBLE"] as const;

export default async function SuperAdminInvoicesPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isSuperAdmin(session.user.id))) redirect("/");

  const { status, q } = searchParams;
  const activeStatus = STATUS_TABS.find((s) => s === status) ?? "ALL";

  const invoices = await db.invoice.findMany({
    where: {
      ...(activeStatus !== "ALL" ? { status: activeStatus } : {}),
      ...(q
        ? { tenant: { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      tenant: { select: { id: true, name: true, slug: true, plan: true } },
    },
  });

  // Summary counts
  const counts = await db.invoice.groupBy({
    by: ["status"],
    _count: { id: true },
    _sum: { amountCents: true },
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, { count: c._count.id, sum: c._sum.amountCents ?? 0 }]));

  const totalPaid = countMap["PAID"]?.sum ?? 0;
  const totalPending = countMap["PENDING"]?.sum ?? 0;

  const statusBadge: Record<string, string> = {
    PAID:           "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    PENDING:        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    VOID:           "bg-muted text-muted-foreground",
    UNCOLLECTIBLE:  "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Nadi platform billing invoices for all workspaces.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total paid",    value: `$${(totalPaid / 100).toFixed(2)}`,    color: "text-green-600" },
          { label: "Pending",       value: `$${(totalPending / 100).toFixed(2)}`, color: "text-amber-600" },
          { label: "Paid invoices", value: countMap["PAID"]?.count ?? 0,          color: "" },
          { label: "Pending count", value: countMap["PENDING"]?.count ?? 0,       color: "" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by workspace…"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        {STATUS_TABS.map((s) => (
          <Link
            key={s}
            href={`/super-admin/invoices?status=${s}${q ? `&q=${q}` : ""}`}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
              activeStatus === s
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            {s !== "ALL" && countMap[s] ? ` (${countMap[s].count})` : ""}
          </Link>
        ))}
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Workspace", "Description", "Amount", "Status", "Due", "Paid", "Actions"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-4 last:pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="pl-4 pr-3 py-3">
                  <Link href={`/super-admin/tenants/${inv.tenant.id}`} className="font-medium hover:text-primary transition-colors">
                    {inv.tenant.name}
                  </Link>
                  <p className="text-[10px] text-muted-foreground">{inv.tenant.plan}</p>
                </td>
                <td className="px-3 py-3 max-w-[180px] truncate text-xs text-muted-foreground">
                  {inv.description ?? "—"}
                </td>
                <td className="px-3 py-3 font-medium text-xs">
                  {(inv.amountCents / 100).toFixed(2)} {inv.currency.toUpperCase()}
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusBadge[inv.status] ?? "bg-muted text-muted-foreground"}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {inv.dueAt ? format(new Date(inv.dueAt), "dd MMM yy") : "—"}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {inv.paidAt ? format(new Date(inv.paidAt), "dd MMM yy") : "—"}
                </td>
                <td className="pr-4 py-3">
                  <InvoiceActions invoiceId={inv.id} currentStatus={inv.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No invoices found.</p>
        )}
      </div>
    </div>
  );
}
