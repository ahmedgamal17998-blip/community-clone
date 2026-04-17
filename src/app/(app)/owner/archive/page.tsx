import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { restoreGroupAction } from "@/server/admin-actions";

async function restoreForm(formData: FormData) {
  "use server";
  await restoreGroupAction(formData);
}

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export default async function OwnerArchivePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Groups soft-deleted where the viewer is OWNER.
  const rows = await db.group.findMany({
    where: {
      deletedAt: { not: null },
      memberships: {
        some: {
          userId: session.user.id,
          role: "OWNER",
        },
      },
    },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      deletedAt: true,
    },
  });

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Archived groups</h1>
        <p className="text-sm text-muted-foreground">
          Soft-deleted groups you own. Restore within 30 days or they&apos;re
          permanently deleted.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No archived groups.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((g) => {
            const purgeAt = g.deletedAt
              ? new Date(g.deletedAt.getTime() + THIRTY_DAYS)
              : null;
            const daysLeft = purgeAt
              ? Math.max(
                  0,
                  Math.ceil((purgeAt.getTime() - Date.now()) / (24 * 3600 * 1000)),
                )
              : 0;
            return (
              <li key={g.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    /{g.slug} · purges in {daysLeft} day{daysLeft === 1 ? "" : "s"}
                  </div>
                  {g.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {g.description}
                    </p>
                  ) : null}
                </div>
                <form action={restoreForm}>
                  <input type="hidden" name="groupId" value={g.id} />
                  <button
                    type="submit"
                    className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Restore
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
