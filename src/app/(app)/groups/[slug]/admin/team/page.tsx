import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { CAPABILITIES, type Capability } from "@/server/capabilities";
import { AdminList } from "./_components/AdminList";
import { InviteAdminDialog } from "./_components/InviteAdminDialog";

export default async function AdminTeamPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "OWNER")) {
    notFound();
  }

  const admins = await db.groupMembership.findMany({
    where: { groupId: group.id, role: { in: ["OWNER", "ADMIN"] }, state: "ACTIVE" },
    include: { user: { select: { id: true, name: true, handle: true, image: true } } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });

  const perms = await db.adminPermission.findMany({
    where: { groupId: group.id, userId: { in: admins.map((a) => a.userId) } },
  });

  const adminsWithCaps = admins.map((a) => {
    const p = perms.find((x) => x.userId === a.userId);
    let caps: Capability[] = [];
    if (a.role === "OWNER") caps = [...CAPABILITIES];
    else if (p) {
      try {
        caps = JSON.parse(p.capabilities);
      } catch {
        caps = [];
      }
    } else {
      caps = [...CAPABILITIES]; // legacy admin without perm row
    }
    return { ...a, capabilities: caps };
  });

  // Members eligible to be promoted (ACTIVE non-admins)
  const eligibleMembers = await db.groupMembership.findMany({
    where: {
      groupId: group.id,
      role: { in: ["MEMBER", "CONTRIBUTOR"] },
      state: "ACTIVE",
    },
    include: { user: { select: { id: true, name: true, handle: true } } },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin team</h1>
          <p className="text-sm text-muted-foreground">
            Add admins with custom capability sets. Owner has all capabilities by default.
          </p>
        </div>
        <InviteAdminDialog
          groupId={group.id}
          eligibleMembers={eligibleMembers.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            handle: m.user.handle,
          }))}
        />
      </div>

      <AdminList groupId={group.id} admins={adminsWithCaps} />
    </div>
  );
}
