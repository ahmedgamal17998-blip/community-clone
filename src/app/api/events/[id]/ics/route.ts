/**
 * GET /api/events/[id]/ics — downloadable iCalendar for a single event.
 * Requires ACTIVE membership in the event's group.
 */
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isAtLeast } from "@/server/permissions";
import { buildIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const event = await db.event.findUnique({ where: { id: params.id } });
  if (!event) return new NextResponse("Not found", { status: 404 });

  const ok = await isAtLeast({
    groupId: event.groupId,
    userId: session.user.id,
    min: "MEMBER",
  });
  if (!ok) return new NextResponse("Forbidden", { status: 403 });

  const ics = buildIcs({
    uid: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    url: event.locationUrl,
    location: event.locationUrl,
    recurrence: event.recurrence,
    recurrenceEndsAt: event.recurrenceEndsAt,
  });

  const safeSlug = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "event";

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${safeSlug}.ics"`,
      "cache-control": "no-store",
    },
  });
}
