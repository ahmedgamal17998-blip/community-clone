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
import { Settings2 } from "lucide-react";
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

const STALE_MS = 5 * 60 * 1000;

export default async function GroupMembersPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string; q?: string };
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

  // Members directory is admin-only — regular members hitting the URL get 404.
  if (!canModerate) {
    notFound();
  }

  const tab: Tab = (["all", "admins", "contributors", "requested", "banned"].includes(
    searchParams.tab ?? "",
  )
    ? (searchParams.tab as Tab)
    : "all");

  const q = (searchParams.q ?? "").trim();
  const filter = TAB_FILTERS[tab];

  const where: {
    groupId: string;
    state?: string;
    role?: { in: string[] };
    user?: {
      OR: Array<
        | { name: { contains: string; mode: "insensitive" } }
        | { handle: { contains: string; mode: "insensitive" } }
        | { email: { contains: string; mode: "insensitive" } }
      >;
    };
  } = { groupId: group.id };
  if (filter.state) where.state = filter.state;
  if (filter.roleIn) where.role = { in: filter.roleIn };
  if (q) {
    where.user = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { handle: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    };
  }

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
          email: true,
          emailPublic: true,
          presence: { select: { lastSeenAt: true, status: true } },
          availability: { select: { id: true } },
        },
      },
    },
  });

  // M11: who-can-be-booked per-group policy
  const policy = await db.groupBookingPolicy.findUnique({
    where: { groupId: group.id },
    select: { whoCanBeBooked: true },
  });
  const whoCanBeBooked = policy?.whoCanBeBooked ?? "EVERYONE";
  function memberBookable(role: string): boolean {
    if (whoCanBeBooked === "ADMINS_ONLY") return role === "ADMIN" || role === "OWNER";
    if (whoCanBeBooked === "CONTRIBUTORS_PLUS")
      return role === "CONTRIBUTOR" || role === "ADMIN" || role === "OWNER";
    return true;
  }

  const pendingCount = canModerate
    ? await db.groupMembership.count({
        where: { groupId: group.id, state: "REQUESTED" },
      })
    : 0;

  const tabs: Array<{ key: Tab; label: string; badge?: number }> = [
    { key: "all",          label: t("memberTabs.all") },
    { key: "admins",       label: t("memberTabs.admins") },
    { key: "contributors", label: t("memberTabs.contributors") },
  ];
  if (canModerate) {
    tabs.push({ key: "requested", label: t("memberTabs.requested"), badge: pendingCount });
    tabs.push({ key: "banned",    label: t("memberTabs.banned") });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          method="GET"
          action={`/groups/${group.slug}/members`}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="tab" value={tab} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search members…"
            className="h-9 w-64 rounded-md border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Search
          </button>
          {q ? (
            <Link
              href={`/groups/${group.slug}/members?tab=${tab}`}
              className="text-xs text-muted-foreground hover:underline"
            >
              Clear
            </Link>
          ) : null}
        </form>
        {canModerate ? (
          <Link
            href={`/groups/${group.slug}/members/invite`}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Invite
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1" role="tablist">
        {tabs.map((x) => {
          const active = x.key === tab;
          const href = q
            ? `/groups/${group.slug}/members?tab=${x.key}&q=${encodeURIComponent(q)}`
            : `/groups/${group.slug}/members?tab=${x.key}`;
          return (
            <Link
              key={x.key}
              href={href}
              className={cn(
                "relative rounded-full px-3 py-1 text-sm transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              role="tab"
              aria-selected={active}
            >
              {x.label}
              {x.badge && x.badge > 0 ? (
                <span className="ms-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                  {x.badge}
                </span>
              ) : null}
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
            const lastSeenAt = m.user.presence?.lastSeenAt;
            const rawStatus = m.user.presence?.status ?? "OFFLINE";
            const effectiveStatus =
              lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() > STALE_MS
                ? "OFFLINE"
                : rawStatus;
            const presenceDot =
              effectiveStatus === "ONLINE" ? "bg-[hsl(var(--presence-online))]"
              : effectiveStatus === "AWAY" ? "bg-[hsl(var(--presence-away))]"
              : "bg-muted-foreground/40";
            const showEmail =
              (m.user.emailPublic || canModerate) && Boolean(m.user.email);
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
                      href={`/profile/${m.user.handle}`}
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
                    {lastSeenAt
                      ? t("activeTime", { time: timeAgo(lastSeenAt) })
                      : t("joined", { date: new Date(m.joinedAt).toLocaleDateString() })}
                    {showEmail ? (
                      <>
                        {" · "}
                        <a
                          href={`mailto:${m.user.email}`}
                          className="hover:underline"
                        >
                          {m.user.email}
                        </a>
                      </>
                    ) : null}
                    {" · "}
                    {t("joined", { date: new Date(m.joinedAt).toLocaleDateString() })}
                  </p>
                </div>
                {m.userId !== session?.user?.id &&
                m.user.availability &&
                m.state === "ACTIVE" &&
                memberBookable(m.role) ? (
                  <Link
                    href={`/profile/${m.user.handle}/book?groupId=${group.id}`}
                    className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2 text-xs font-medium hover:border-primary hover:text-primary"
                    title="Book a session"
                  >
                    Book
                  </Link>
                ) : null}
                {canModerate && m.userId !== session?.user?.id ? (
                  <Link
                    href={`/groups/${group.slug}/admin/members/${m.userId}`}
                    title="Manage access"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Link>
                ) : null}
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
