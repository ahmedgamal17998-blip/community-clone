/**
 * Event reminders cron (M10).
 * Runs every 15 minutes on Vercel. Sends 24h-before and 1h-before reminders
 * to users who RSVP'd GOING. Idempotent via EventReminderSent unique key.
 */
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/server/db";
import { expandOccurrences } from "@/server/events";
import { formatInTZ } from "@/lib/calendar";
import { createNotification } from "@/server/notifications";

export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;

export async function GET(req: Request) {
  // Auth guard: require either Vercel Cron header OR CRON_SECRET bearer.
  const isVercelCron = req.headers.get("x-vercel-cron");
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const secretOk = secret && authHeader === `Bearer ${secret}`;
  if (!isVercelCron && !secretOk) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + 25 * HOUR);

  // Pull candidate events
  const events = await db.event.findMany({
    where: {
      startsAt: { lte: horizon },
      OR: [
        { recurrence: "NONE", endsAt: { gte: now } },
        {
          recurrence: "WEEKLY",
          OR: [
            { recurrenceEndsAt: null },
            { recurrenceEndsAt: { gte: now } },
          ],
        },
      ],
    },
    include: {
      group: { select: { slug: true, name: true } },
      rsvps: {
        where: { status: "GOING" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  const resend = process.env.AUTH_RESEND_KEY
    ? new Resend(process.env.AUTH_RESEND_KEY)
    : null;
  const from =
    process.env.EMAIL_FROM ?? "Nadi <onboarding@resend.dev>";
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  let sent = 0;

  for (const ev of events) {
    const occs = await expandOccurrences(ev, now, horizon);
    for (const occ of occs) {
      const diffMs = occ.occurrenceStartsAt.getTime() - now.getTime();
      if (diffMs <= 0) continue;

      const kinds: Array<"T_24H" | "T_1H"> = [];
      if (diffMs >= 23.5 * HOUR && diffMs <= 24.5 * HOUR) kinds.push("T_24H");
      if (diffMs >= 0.5 * HOUR && diffMs <= 1.5 * HOUR) kinds.push("T_1H");
      if (kinds.length === 0) continue;

      for (const rsvp of ev.rsvps) {
        if (!rsvp.user.email) continue;
        for (const kind of kinds) {
          // Idempotency
          const already = await db.eventReminderSent.findUnique({
            where: {
              eventId_userId_occurrenceStartsAt_kind: {
                eventId: ev.id,
                userId: rsvp.userId,
                occurrenceStartsAt: occ.occurrenceStartsAt,
                kind,
              },
            },
          });
          if (already) continue;

          const when =
            kind === "T_24H" ? "24 hours" : "1 hour";
          const subject = `Reminder: "${ev.title}" starts in ${when}`;
          const link = `${baseUrl}/groups/${ev.group.slug}/events/${ev.id}?occ=${encodeURIComponent(
            occ.occurrenceStartsAt.toISOString(),
          )}`;
          const text = [
            subject,
            "",
            `${ev.title} in ${ev.group.name}`,
            `When: ${formatInTZ(occ.occurrenceStartsAt, ev.timezone)} (${ev.timezone})`,
            ev.locationUrl ? `Join: ${ev.locationUrl}` : "",
            `Open: ${link}`,
          ]
            .filter(Boolean)
            .join("\n");

          if (resend) {
            try {
              await resend.emails.send({
                from,
                to: rsvp.user.email,
                subject,
                text,
              });
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error("event reminder send failed", e);
              continue;
            }
          } else {
            // eslint-disable-next-line no-console
            console.log(
              `\n🔔 Event reminder → ${rsvp.user.email}\n    ${subject}\n    ${link}\n`,
            );
          }

          try {
            await db.eventReminderSent.create({
              data: {
                eventId: ev.id,
                userId: rsvp.userId,
                occurrenceStartsAt: occ.occurrenceStartsAt,
                kind,
              },
            });
            sent++;
            // Mirror an in-app notification.
            await createNotification({
              userId: rsvp.userId,
              type: "EVENT_REMINDER",
              groupId: ev.groupId,
              snippet: `${ev.title} starts in ${when}`,
              href: link,
            }).catch(() => null);
          } catch {
            // race: unique violation — already sent
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, dispatched: sent });
}
