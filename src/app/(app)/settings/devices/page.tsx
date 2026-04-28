import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { RevokeButton } from "./_components/RevokeButton";

export default async function DevicesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sessions = await db.session.findMany({
    where: { userId: session.user.id, expires: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">My devices</h1>
        <p className="text-sm text-muted-foreground">
          You can be signed in on at most 2 devices simultaneously. Sign in on a
          new device to evict the oldest.
        </p>
      </div>

      <div className="space-y-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active devices.</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border bg-card p-4"
            >
              <div>
                <div className="font-medium">
                  {s.deviceLabel ?? "Web"}
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-md">
                  {s.userAgent ?? "Unknown"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Last seen: {new Date(s.lastSeenAt).toLocaleString()}
                  {s.ip ? ` • ${s.ip}` : ""}
                </div>
              </div>
              <RevokeButton sessionId={s.id} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

