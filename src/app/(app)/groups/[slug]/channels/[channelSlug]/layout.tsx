import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { hasMinRole, type Role } from "@/server/permissions";
import { hasAccess } from "@/server/access";
import { getChannelWithContext } from "@/lib/channel-queries";
import { ChannelTabs } from "@/components/channel/ChannelTabs";
import { Hash, Lock, Megaphone } from "lucide-react";

export default async function ChannelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string; channelSlug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Memoized query: channel + group + user's access grants + membership in
  // one round-trip. React cache() deduplicates this between layout and page
  // so the DB is only hit once even though both components call this helper.
  const channel = await getChannelWithContext(
    params.channelSlug,
    params.slug,
    session.user.id,
  );
  if (!channel || channel.archived) notFound();

  const membership = channel.group.memberships[0] ?? null;

  // Non-active members (REQUESTED / no membership): redirect to the group
  // page so they see the join gate or pending message — never a raw 404.
  if (!membership || membership.state !== "ACTIVE") {
    redirect(`/groups/${params.slug}`);
  }

  if (channel.kind === "PRIVATE") {
    const isAdmin = hasMinRole(membership.role as Role, "ADMIN");
    const hasGrant = channel.accesses.length > 0;
    // Don't 404 — redirect active members to the group so they see the
    // channel list and understand why this channel isn't available to them.
    if (!isAdmin && !hasGrant) redirect(`/groups/${params.slug}`);
  }

  // Per-member explicit DENY (set in admin → AccessMatrix). Admins bypass.
  const isAdminOrAbove = hasMinRole(membership.role as Role, "ADMIN");
  if (!isAdminOrAbove) {
    const allowed = await hasAccess({
      userId: session.user.id,
      groupId: channel.group.id,
      resourceType: "CHANNEL",
      resourceId: channel.id,
    });
    // Not allowed → redirect to the member's subscription page so they
    // can subscribe / see the upgrade CTA, rather than getting a raw 404.
    if (!allowed) redirect(`/groups/${params.slug}/me`);
  }

  const KindIcon =
    channel.kind === "PRIVATE"
      ? Lock
      : channel.kind === "ANNOUNCEMENT"
        ? Megaphone
        : Hash;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      {/* Channel header (integrated into card with chat below) */}
      <div className="border-b border-border px-4 pb-1 pt-4 sm:px-5">
        <div className="flex items-center gap-2">
          {channel.emoji ? (
            <span className="text-xl leading-none">{channel.emoji}</span>
          ) : (
            <KindIcon className="h-5 w-5 text-muted-foreground" />
          )}
          <h1 className="text-[18px] font-extrabold leading-tight">{channel.name}</h1>
        </div>
        {channel.description ? (
          <p className="mt-1 text-[13px] text-muted-foreground">{channel.description}</p>
        ) : null}
        <div className="mt-2">
          <ChannelTabs
            groupSlug={channel.group.slug}
            channelSlug={channel.slug}
            chatEnabled={channel.chatEnabled}
          />
        </div>
      </div>

      {/* Page content (chat / posts) — connects seamlessly */}
      <div>{children}</div>
    </div>
  );
}
