/**
 * /groups/[slug]/admin/notifications — Group notification settings.
 * Admin controls which events generate in-app notifications for members/admins.
 */
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { getGroupNotifSettings } from "@/server/group-notif-settings";
import { GroupNotifSettingsClient } from "@/components/groups/GroupNotifSettingsClient";
import { Bell } from "lucide-react";

export default async function GroupNotificationsPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      tenant: { select: { ownerId: true } },
    },
  });
  if (!group || group.deletedAt) notFound();

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true, state: true },
  });

  const isOwnerOfTenant = group.tenant.ownerId === session.user.id;
  const isGroupAdmin = membership?.state === "ACTIVE" && hasMinRole(membership.role as Role, "ADMIN");

  if (!isGroupAdmin && !isOwnerOfTenant) notFound();

  const settings = await getGroupNotifSettings(group.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Notification settings</h1>
          <p className="text-sm text-muted-foreground">
            Control which events generate in-app notifications for <strong>{group.name}</strong>.
          </p>
        </div>
      </div>

      <GroupNotifSettingsClient groupId={group.id} initialSettings={settings} />
    </div>
  );
}
