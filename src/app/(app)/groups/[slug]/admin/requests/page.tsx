import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { decidePendingAction } from "@/server/groups";
import { timeAgo } from "@/lib/utils";

export default async function AdminRequestsPage({
  params,
}: {
  params: { slug: string };
}) {
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const pending = await db.groupMembership.findMany({
    where: { groupId: group.id, state: "REQUESTED" },
    orderBy: { joinedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, handle: true, image: true } },
    },
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Pending requests</h1>
        <p className="text-sm text-muted-foreground">
          Approve or reject people asking to join this group.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No pending requests.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {pending.map((m) => (
            <li key={m.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {m.user.name ?? `@${m.user.handle}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{m.user.handle} · requested {timeAgo(m.joinedAt)}
                  </div>
                  {m.note ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {m.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <form action={decidePendingAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <input type="hidden" name="decision" value="APPROVE" />
                    <button
                      type="submit"
                      className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={decidePendingAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <input type="hidden" name="decision" value="REJECT" />
                    <button
                      type="submit"
                      className="h-8 rounded-md border border-border bg-background px-3 text-sm hover:border-destructive hover:text-destructive"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
