import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { NewGroupThreadForm } from "@/components/chat/NewGroupThreadForm";

export const dynamic = "force-dynamic";

export default async function NewChatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Group chats can only be created by admins/owners with CHATS_MANAGE.
  // Filter the viewer's memberships down to those groups.
  const adminMemberships = await db.groupMembership.findMany({
    where: {
      userId: session.user.id,
      state: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: {
      groupId: true,
      group: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  const allowedMemberships: typeof adminMemberships = [];
  for (const m of adminMemberships) {
    const ok = await hasCapability({
      userId: session.user.id,
      groupId: m.groupId,
      capability: "CHATS_MANAGE",
    });
    if (ok) allowedMemberships.push(m);
  }

  if (allowedMemberships.length === 0) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold">Group chats are admin-only</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Members can DM each other, but only group admins with permission can
          create new group chats.
        </p>
        <Link
          href="/chat"
          className="mt-5 inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
        >
          Back to chat
        </Link>
      </section>
    );
  }

  const myGroups = allowedMemberships.map((m) => m.group);
  const groupIds = allowedMemberships.map((m) => m.groupId);

  // Build a per-group candidate list (member of each group, minus self).
  const otherMemberships = groupIds.length
    ? await db.groupMembership.findMany({
        where: {
          groupId: { in: groupIds },
          state: "ACTIVE",
          userId: { not: session.user.id },
        },
        select: {
          groupId: true,
          user: { select: { id: true, name: true, handle: true, image: true } },
        },
      })
    : [];

  // Group the candidates by groupId for client-side filtering.
  const candidatesByGroup: Record<
    string,
    Array<{ id: string; name: string | null; handle: string; image: string | null }>
  > = {};
  for (const m of otherMemberships) {
    if (!candidatesByGroup[m.groupId]) candidatesByGroup[m.groupId] = [];
    // De-dupe within a group (defensive).
    if (!candidatesByGroup[m.groupId].some((c) => c.id === m.user.id)) {
      candidatesByGroup[m.groupId].push(m.user);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/chat"
          aria-label="Back"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">New group chat</h1>
      </div>
      <NewGroupThreadForm
        groups={myGroups}
        candidatesByGroup={candidatesByGroup}
      />
    </section>
  );
}
