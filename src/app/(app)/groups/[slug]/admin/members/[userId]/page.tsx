import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { AccessMatrix } from "./_components/AccessMatrix";
import { ExpiryEditor } from "./_components/ExpiryEditor";
import { LoginHistoryTable } from "./_components/LoginHistoryTable";
import { SubscriptionActions } from "./_components/SubscriptionActions";

/**
 * M18: Admin per-member control panel.
 *
 * Lets an admin (with SUBS_MANAGE) toggle resource access, set expiry,
 * extend/cancel subscriptions, and view login history.
 */
export default async function AdminMemberPage({
  params,
}: {
  params: { slug: string; userId: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      name: true,
      channels: {
        where: { archived: false },
        orderBy: { position: "asc" },
        select: { id: true, name: true, slug: true, kind: true },
      },
      courses: { select: { id: true, title: true, slug: true } },
      subscriptionPlans: {
        where: { active: true },
        select: { id: true, name: true, durationDays: true, priceCents: true },
      },
    },
  });
  if (!group) notFound();

  // Group chats tied to this group (kind=GROUP, has groupId).
  const chatThreads = await db.chatThread.findMany({
    where: { groupId: group.id, kind: "GROUP" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });

  const allowed = await hasCapability({
    userId: session.user.id,
    groupId: group.id,
    capability: "SUBS_MANAGE",
  });
  if (!allowed) notFound();

  const member = await db.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      image: true,
      bio: true,
    },
  });
  if (!member) notFound();

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: member.id } },
  });
  if (!membership) notFound();

  const accesses = await db.memberAccess.findMany({
    where: { userId: member.id, groupId: group.id },
  });

  const subs = await db.subscription.findMany({
    where: { userId: member.id, groupId: group.id },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
    take: 5,
  });

  const loginHistory = await db.loginHistory.findMany({
    where: { userId: member.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/groups/${group.slug}/admin/members`}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{member.name ?? member.handle}</h1>
          <p className="text-sm text-muted-foreground">@{member.handle}</p>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Access &amp; expiry</h2>
        <ExpiryEditor
          groupId={group.id}
          userId={member.id}
          accessExpiresAt={membership.accessExpiresAt}
          lockedAt={membership.lockedAt}
        />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Subscription</h2>
        <SubscriptionActions
          groupId={group.id}
          userId={member.id}
          plans={group.subscriptionPlans}
          activeSubscriptions={subs}
        />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Per-resource access</h2>
        <AccessMatrix
          groupId={group.id}
          userId={member.id}
          channels={group.channels}
          courses={group.courses}
          chatThreads={chatThreads}
          accesses={accesses}
        />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Login history</h2>
        <LoginHistoryTable rows={loginHistory} />
      </section>
    </div>
  );
}
