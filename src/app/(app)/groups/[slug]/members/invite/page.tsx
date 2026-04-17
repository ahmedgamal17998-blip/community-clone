import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isAtLeast } from "@/server/permissions";
import { revokeInviteAction } from "@/server/invite-actions";
import { InviteForm } from "@/components/group/InviteForm";

export default async function GroupInvitePage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) notFound();

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true, name: true },
  });
  if (!group) notFound();

  const allowed = await isAtLeast({
    groupId: group.id,
    userId: session.user.id,
    min: "ADMIN",
  });
  if (!allowed) notFound();

  const now = new Date();
  const pending = await db.invite.findMany({
    where: {
      groupId: group.id,
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    include: {
      invitedBy: { select: { name: true, handle: true } },
    },
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invite to {group.name}</h1>
          <p className="text-sm text-muted-foreground">
            Send an invite by email, or just copy the link.
          </p>
        </div>
        <Link
          href={`/groups/${group.slug}/members`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to members
        </Link>
      </div>

      <InviteForm groupId={group.id} />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Pending invites</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {pending.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {inv.email ?? "(no email)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.role} · expires {inv.expiresAt.toLocaleDateString()} ·
                    by @{inv.invitedBy.handle}
                  </p>
                </div>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="inviteId" value={inv.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    Revoke
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
