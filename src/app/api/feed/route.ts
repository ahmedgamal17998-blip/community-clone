/**
 * Feed page loader — returns the next page of post HTML-lite JSON for the
 * infinite-scroll client on the Discussion tab and channel feed.
 *
 * Query params:
 *   groupId    — when set, loads the group feed (respects channel visibility)
 *   channelId  — when set, loads the single-channel feed
 *   cursor     — opaque string from the previous page
 */
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { listChannelPosts, listGroupFeed, decodeMedia } from "@/server/posts";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const channelId = url.searchParams.get("channelId");
  const cursor = url.searchParams.get("cursor");

  if (!groupId && !channelId) {
    return NextResponse.json({ error: "MISSING_SCOPE" }, { status: 400 });
  }

  // Viewer must be an ACTIVE member of the group.
  const scopeGroupId = groupId
    ? groupId
    : (
        await db.channel.findUnique({
          where: { id: channelId! },
          select: { groupId: true },
        })
      )?.groupId;
  if (!scopeGroupId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: scopeGroupId, userId: session.user.id },
    },
    select: { role: true, state: true },
  });
  if (!membership || membership.state !== "ACTIVE") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // For channel feed, verify PRIVATE access too.
  if (channelId) {
    const channel = await db.channel.findUnique({
      where: { id: channelId },
      include: {
        accesses: { where: { userId: session.user.id }, select: { id: true } },
      },
    });
    if (!channel) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (channel.kind === "PRIVATE") {
      const isAdmin = hasMinRole(membership.role as Role, "ADMIN");
      const hasGrant = channel.accesses.length > 0;
      if (!isAdmin && !hasGrant) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
    }
  }

  const page = channelId
    ? await listChannelPosts({ channelId, cursor })
    : await listGroupFeed({ groupId: groupId!, userId: session.user.id, cursor });

  return NextResponse.json({
    items: page.items.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      mediaUrls: decodeMedia(p.mediaUrls),
      pinned: p.pinned,
      createdAt: p.createdAt.toISOString(),
      editedAt: p.editedAt?.toISOString() ?? null,
      authorId: p.authorId,
      author: p.author,
      channel: p.channel,
    })),
    nextCursor: page.nextCursor,
  });
}
