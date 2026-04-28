/**
 * Group header: avatar + name + description + join/leave/settings CTA row.
 */
import Link from "next/link";
import { Globe, Lock, EyeOff, LayoutDashboard } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { GroupAvatar } from "@/components/group/GroupAvatar";
import { Button } from "@/components/ui/button";
import { joinGroupAction, leaveGroupAction } from "@/server/groups";
import { hasMinRole, type Role } from "@/server/permissions";

type Props = {
  group: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    primaryHsl: string;
    visibility: string;
    memberCount: number;
  };
  myMembership: {
    role: string;
    state: string;
  } | null;
};

export async function GroupHeader({ group, myMembership }: Props) {
  const t = await getTranslations("groups");
  const VisibilityIcon =
    group.visibility === "PUBLIC" ? Globe
    : group.visibility === "PRIVATE" ? Lock
    : EyeOff;

  const isMember = myMembership?.state === "ACTIVE";
  const isPending = myMembership?.state === "REQUESTED";
  const canManage =
    myMembership?.state === "ACTIVE" &&
    hasMinRole(myMembership.role as Role, "ADMIN");

  return (
    <div className="flex items-start gap-4 py-5">
      <GroupAvatar name={group.name} logoUrl={group.logoUrl} primaryHsl={group.primaryHsl} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{group.name}</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <VisibilityIcon className="h-3 w-3" />
            {t(`visibility.${group.visibility.toLowerCase()}`)}
          </span>
          <span className="text-xs text-muted-foreground">
            · {t("memberCount", { count: group.memberCount })}
          </span>
        </div>
        {group.description ? (
          <p className="mt-1 text-sm text-muted-foreground dir-auto">{group.description}</p>
        ) : null}
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {canManage ? (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/groups/${group.slug}/admin`}>
              <LayoutDashboard className="h-4 w-4" />
              <span>Admin Dashboard</span>
            </Link>
          </Button>
        ) : null}
        {!myMembership ? (
          <form action={joinGroupAction}>
            <input type="hidden" name="groupId" value={group.id} />
            <Button type="submit" size="sm">
              {group.visibility === "PUBLIC" ? t("join") : t("requestJoin")}
            </Button>
          </form>
        ) : isPending ? (
          <Button variant="outline" size="sm" disabled>
            {t("pending")}
          </Button>
        ) : isMember && myMembership.role !== "OWNER" ? (
          <form action={leaveGroupAction}>
            <input type="hidden" name="groupId" value={group.id} />
            <Button type="submit" variant="ghost" size="sm">
              {t("leave")}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
