import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { RoleMenu } from "@/components/group/RoleMenu";
import { hasMinRole, type Role } from "@/server/permissions";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Tab = "all" | "admins" | "contributors" | "requested" | "banned";

const TAB_FILTERS: Record<Tab, { state?: string; roleIn?: string[] }> = {
  all:          { state: "ACTIVE" },
  admins:       { state: "ACTIVE", roleIn: ["OWNER", "ADMIN"] },
  contributors: { state: "ACTIVE", roleIn: ["CONTRIBUTOR"] },
  requested:    { state: "REQUESTED" },
  banned:       { state: "BANNED" },
};

export default async function GroupMembersPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  const session = await auth();
  const t = await getTranslations("groups");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const me = session?.user
    ? await db.groupMembership.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
      })
    : null;

  const canModerate =
    me?.state === "ACTIVE" && hasMinRole(me.role as Role, "ADMIN");
  const amOwner = me?.role === "OWNER" && me?.state === "ACTIVE";

  const tab: Tab = (["all", "admins", "contributors", "requested", "banned"].includes(
    searchParams.tab ?? "",
  )
    ? (searchParams.tab as Tab)
    : "all");

  const filter = TAB_FILTERS[tab];

  const where: {
    groupId: string;
    state?: string;
    role?: { in: string[] };
  } = { groupId: group.id };
  if (filter.state) where.state = filter.state;
  if (filter.roleIn) where.role = { in: filter.roleIn };

  const members = await db.groupMembership.findMany({
    where,
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          handle: true,
          image: true,
          presence: { select: { lastSeenAt: true, status: true } },
        },
      },
    },
  });

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "all",          label: t("memberTabs.all") },
    { key: "admins",       label: t("memberTabs.admins") },
    { key: "contributors", label: t("memberTabs.contributors") },
  ];
  if (canModerate) {
    tabs.push({ key: "requested", label: t("memberTabs.requested") });
    tabs.push({ key: "banned",    label: t("memberTabs.banned") });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1" role="tablist">
        {tabs.map((x) => {
          const active = x.key === tab;
          return (
            <Link
              key={x.key}
              href={`/groups/${group.slug}/members?tab=${x.key}`}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              role="tab"
              aria-selected={active}
            >
              {x.label}
            </Link>
          );
        })}
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {members.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t("memberTabs.empty")}
          </div>
        ) : (
          members.map((m) => {
            const presenceDot =
              m.user.presence?.status === "ONLINE" ? "bg-[hsl(var(--presence-online))]"
              : m.user.presence?.status === "AWAY" ? "bg-[hsl(var(--presence-away))]"
              : "bg-muted-foreground/40";
            return (
              <div key={m.id} className="flex items-center gap-3 p-3">
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    {m.user.image ? (
                      <AvatarImage src={m.user.image} alt={m.user.name ?? ""} />
                    ) : null}
                    <AvatarFallback>{initialsFrom(m.user.name)}</AvatarFallback>
                  </Avatar>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -end-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                      presenceDot,
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <Link
                      href={`/profile/@${m.user.handle}`}
                      className="truncate font-medium hover:underline"
                    >
                      {m.user.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">@{m.user.handle}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {m.role}
                    </span>
                    {m.state !== "ACTIVE" ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                        {m.state}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.user.presence?.lastSeenAt
                      ? t("activeTime", { time: timeAgo(m.user.presence.lastSeenAt) })
                      : t("joined", { date: new Date(m.joinedAt).toLocaleDateString() })}
                  </p>
                </div>
                {canModerate && m.userId !== session?.user?.id ? (
                  <RoleMenu
                    membershipId={m.id}
                    currentRole={m.role}
                    currentState={m.state}
                    isOwnerMenu={amOwner}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
