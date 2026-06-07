import { db } from "@/server/db";
import { UsersTable } from "./_components/UsersTable";
import { Users } from "lucide-react";

const PAGE_SIZE = 50;

export default async function SuperAdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const query = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? 1));

  const where = query
    ? {
        OR: [
          { name:   { contains: query, mode: "insensitive" as const } },
          { email:  { contains: query, mode: "insensitive" as const } },
          { handle: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        handle: true,
        accountType: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">All Users</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} total user{total !== 1 ? "s" : ""} across the platform
          </p>
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by name, email, or handle…"
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Search
        </button>
        {query && (
          <a
            href="/super-admin/users"
            className="flex h-9 items-center rounded-lg border border-border px-4 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <UsersTable users={users} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/super-admin/users?${new URLSearchParams({ q: query, page: String(page - 1) })}`}
                className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted transition-colors"
              >
                ← Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/super-admin/users?${new URLSearchParams({ q: query, page: String(page + 1) })}`}
                className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted transition-colors"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
