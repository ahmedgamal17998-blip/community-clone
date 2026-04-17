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

  // Everyone the viewer shares an ACTIVE group with.
  const myGroups = await db.groupMembership.findMany({
    where: { userId: session.user.id, state: "ACTIVE" },
    select: { groupId: true },
  });
  const groupIds = myGroups.map((g) => g.groupId);

  const mutualMembers = groupIds.length
    ? await db.groupMembership.findMany({
        where: {
          groupId: { in: groupIds },
          state: "ACTIVE",
          userId: { not: session.user.id },
        },
        select: {
          user: { select: { id: true, name: true, handle: true, image: true } },
        },
      })
    : [];

  const seen = new Set<string>();
  const unique = mutualMembers
    .map((m) => m.user)
    .filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

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
      <NewGroupThreadForm candidates={unique} />
    </section>
  );
}
