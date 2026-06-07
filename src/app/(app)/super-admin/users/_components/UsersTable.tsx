"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteUserAction } from "@/server/actions/super-admin-users";
import { Trash2 } from "lucide-react";

type User = {
  id: string;
  name: string | null;
  email: string | null;
  handle: string;
  accountType: string;
  createdAt: Date;
  _count: { memberships: number };
};

export function UsersTable({ users }: { users: User[] }) {
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDelete(userId: string, name: string | null) {
    if (
      !confirm(
        `Delete user "${name ?? userId}"?\n\nThis will permanently remove them from ALL groups and communities. This cannot be undone.`,
      )
    )
      return;

    setError(null);
    setDeletingId(userId);
    startTransition(async () => {
      const result = await deleteUserAction(userId);
      setDeletingId(null);
      if ("error" in result) {
        setError(
          result.error === "CANNOT_DELETE_SUPER_ADMIN"
            ? "You cannot delete your own account."
            : "Failed to delete user. Please try again.",
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground sm:table-cell">
                Email
              </th>
              <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground md:table-cell">
                Type
              </th>
              <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground lg:table-cell">
                Groups
              </th>
              <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground xl:table-cell">
                Joined
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{user.name ?? "(no name)"}</p>
                    <p className="text-xs text-muted-foreground">@{user.handle}</p>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {user.email ?? "—"}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.accountType === "OWNER"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {user.accountType}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground lg:table-cell">
                  {user._count.memberships}
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    disabled={isPending && deletingId === user.id}
                    onClick={() => handleDelete(user.id, user.name)}
                    title="Delete user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
