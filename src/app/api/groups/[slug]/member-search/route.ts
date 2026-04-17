import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 50);

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!group) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Caller must be an active member to search.
  const callerMem = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: group.id, userId: session.user.id },
    },
    select: { state: true },
  });
  if (!callerMem || callerMem.state !== "ACTIVE") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const members = await db.groupMembership.findMany({
    where: {
      groupId: group.id,
      state: "ACTIVE",
      ...(q
        ? {
            user: {
              OR: [
                { handle: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    take: 8,
    select: {
      user: {
        select: { id: true, name: true, handle: true, image: true },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json({
    results: members.map((m) => m.user),
  });
}
