import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { buildBookingIcs } from "@/lib/ics";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const b = await db.booking.findUnique({
    where: { id: params.id },
    include: {
      host: { select: { id: true, email: true, name: true } },
      invitee: { select: { id: true, email: true, name: true } },
    },
  });
  if (!b) return new NextResponse("Not found", { status: 404 });
  if (b.hostId !== session.user.id && b.inviteeId !== session.user.id) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const ics = buildBookingIcs({
    uid: b.id,
    title: b.title,
    description: b.description,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    hostEmail: b.host.email ?? "host@example.com",
    hostName: b.host.name ?? null,
    attendees: [
      {
        email: b.invitee?.email ?? b.inviteeEmail,
        name: b.invitee?.name ?? b.inviteeName ?? null,
      },
    ],
    meetLink: b.meetLink,
    method: b.status === "CANCELLED" ? "CANCEL" : "PUBLISH",
    status: b.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${b.id}.ics"`,
    },
  });
}
