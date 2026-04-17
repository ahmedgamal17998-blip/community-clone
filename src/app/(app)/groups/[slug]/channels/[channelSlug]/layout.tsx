import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
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

  // Resolve group + channel together.
  const channel = await db.channel.findFirst({
    where: { slug: params.channelSlug, group: { slug: params.slug } },
    include: {
      group: { select: { id: true, slug: true } },
      accesses: { where: { userId: session.user.id }, select: { id: true } },
    },
  });
  if (!channel || channel.archived) notFound();

  // Visibility gate — ACTIVE member required; PRIVATE additionally needs a
  // ChannelAccess grant (unless the user is ADMIN+).
  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: channel.group.id, userId: session.user.id },
    },
    select: { role: true, state: true },
  });
  if (!membership || membership.state !== "ACTIVE") notFound();

  if (channel.kind === "PRIVATE") {
    const isAdmin = hasMinRole(membership.role as Role, "ADMIN");
    const hasGrant = channel.accesses.length > 0;
    if (!isAdmin && !hasGrant) notFound();
  }

  const KindIcon =
    channel.kind === "PRIVATE"
      ? Lock
      : channel.kind === "ANNOUNCEMENT"
        ? Megaphone
        : Hash;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        {channel.emoji ? (
          <span className="text-xl leading-none">{channel.emoji}</span>
        ) : (
          <KindIcon className="h-5 w-5 text-muted-foreground" />
        )}
        <h1 className="text-xl font-semibold">{channel.name}</h1>
      </header>
      {channel.description ? (
        <p className="text-sm text-muted-foreground">{channel.description}</p>
      ) : null}

      <ChannelTabs groupSlug={channel.group.slug} channelSlug={channel.slug} />

      <div>{children}</div>
    </div>
  );
}
