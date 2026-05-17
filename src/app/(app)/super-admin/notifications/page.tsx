/**
 * /super-admin/notifications — Send platform notifications to owners.
 * Compose + send + recent broadcast history.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSuperAdmin } from "@/server/super-admin";
import { format } from "date-fns";
import { Bell } from "lucide-react";
import { SendNotificationForm } from "@/components/admin/SendNotificationForm";

export default async function SuperAdminNotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isSuperAdmin(session.user.id))) redirect("/");

  // Fetch all tenants for the "specific owner" picker
  const tenants = await db.tenant.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, plan: true },
  });

  // Recent platform notice history — group by (snippet, actorId) to dedupe batches
  const recentBroadcasts = await db.notification.groupBy({
    by: ["snippet", "actorId"],
    where: { type: "PLATFORM_NOTICE" },
    _count: { id: true },
    _max:   { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: 20,
  });

  // Fetch actor names
  const actorIds = [...new Set(recentBroadcasts.map((b) => b.actorId).filter(Boolean) as string[])];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorMap = Object.fromEntries(actors.map((a) => [a.id, a.name ?? a.email ?? a.id]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Send platform-wide or targeted notifications to workspace owners.
        </p>
      </div>

      {/* Compose form */}
      <SendNotificationForm tenants={tenants} />

      {/* Broadcast history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5" /> Recent broadcasts
        </h2>
        {recentBroadcasts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No broadcasts sent yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            {recentBroadcasts.map((b, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                  <Bell className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{b.snippet}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                    <span>Sent by {b.actorId ? actorMap[b.actorId] ?? b.actorId : "system"}</span>
                    <span>·</span>
                    <span>{b._count.id} recipient{b._count.id !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{b._max.createdAt ? format(new Date(b._max.createdAt), "dd MMM yyyy, HH:mm") : "—"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
