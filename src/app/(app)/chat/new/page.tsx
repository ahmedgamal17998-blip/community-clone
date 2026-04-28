import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { NewGroupThreadForm } from "@/components/chat/NewGroupThreadForm";

export const dynamic = "force-dynamic";

export default async function NewChatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Groups the viewer is an ACTIVE member of.
  const myMemberships = await db.groupMembership.findMany({
    where: { userId: session.user.id, state: "ACTIVE" },
    select: {
      groupId: true,
      group: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { joinedAt: "desc" },
  });
  const myGroups = myMemberships.map((m) => m.group);
  const groupIds = myMemberships.map((m) => m.groupId);

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
