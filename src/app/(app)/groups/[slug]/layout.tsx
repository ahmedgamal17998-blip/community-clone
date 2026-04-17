import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getGroupForUser } from "@/server/group-queries";
import { listVisibleChannels } from "@/server/channels";
import { hasMinRole, type Role } from "@/server/permissions";
import { GroupThemeProvider } from "@/components/group/GroupThemeProvider";
import { GroupHeader } from "@/components/group/GroupHeader";
import { GroupTabs } from "@/components/group/GroupTabs";
import { GroupRightRail } from "@/components/group/GroupRightRail";
import { ChannelSidebar } from "@/components/channel/ChannelSidebar";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const found = await getGroupForUser(params.slug, session.user.id);
  if (!found) notFound();
  const { group, myMembership } = found;

  // HIDDEN groups: only visible to members.
  if (group.visibility === "HIDDEN" && !myMembership) notFound();
  // BANNED users: treat as not found to avoid leaking state.
  if (myMembership?.state === "BANNED") notFound();

  const isActiveMember = myMembership?.state === "ACTIVE";
  const canManage = isActiveMember
    ? hasMinRole(myMembership!.role as Role, "ADMIN")
    : false;

  const channels = isActiveMember
    ? await listVisibleChannels(group.id, session.user.id)
    : [];

  return (
    <GroupThemeProvider primaryHsl={group.primaryHsl}>
      <div className="border-b border-border bg-card">
        <div className="mx-auto w-full max-w-[1280px] px-3 sm:px-4">
          <GroupHeader
            group={{
              id: group.id,
              name: group.name,
              slug: group.slug,
              description: group.description,
              logoUrl: group.logoUrl,
              primaryHsl: group.primaryHsl,
              visibility: group.visibility,
              memberCount: group._count.memberships,
            }}
            myMembership={myMembership}
          />
          <GroupTabs slug={group.slug} />
        </div>
      </div>

      <div
        className={
          isActiveMember
            ? "mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-6 px-3 py-6 sm:px-4 lg:grid-cols-[240px_1fr_280px]"
            : "mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-6 px-3 py-6 sm:px-4 lg:grid-cols-[1fr_280px]"
        }
      >
        {isActiveMember ? (
          <aside className="hidden lg:block">
            <ChannelSidebar
              groupSlug={group.slug}
              channels={channels.map((c) => ({
                id: c.id,
                slug: c.slug,
                name: c.name,
                emoji: c.emoji,
                kind: c.kind,
              }))}
              canManage={canManage}
            />
          </aside>
        ) : null}
        <div className="min-w-0">{children}</div>
        <aside className="hidden lg:block">
          <GroupRightRail
            memberCount={group._count.memberships}
            visibility={group.visibility}
            createdAt={group.createdAt}
          />
        </aside>
      </div>
    </GroupThemeProvider>
  );
}
