/**
 * Booking email dispatch (M11). Mirrors the Resend-or-console pattern from
 * src/server/auth.ts and src/server/notifications.ts.
 */
import "server-only";
import { Resend as ResendClient } from "resend";
import { buildBookingIcs, type IcsBookingInput } from "@/lib/ics";

type BookingEmailPayload = {
  to: string;
  subject: string;
  text: string;
  ics: {
    filename: string;
    content: string;
  };
};

async function send(payload: BookingEmailPayload) {
  if (!process.env.AUTH_RESEND_KEY) {
    // eslint-disable-next-line no-console
    console.log(
      `\n📅  Booking email → ${payload.to}\n    subject: ${payload.subject}\n    (ICS attachment suppressed — AUTH_RESEND_KEY unset)\n`,
    );
    return;
  }
  try {
    const resend = new ResendClient(process.env.AUTH_RESEND_KEY);
    await resend.emails.send({
      from:
        process.env.EMAIL_FROM ?? "Community Clone <onboarding@resend.dev>",
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      attachments: [
        {
          filename: payload.ics.filename,
          content: Buffer.from(payload.ics.content, "utf8").toString("base64"),
          contentType: "text/calendar",
        },
      ],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Resend booking email failed", err);
  }
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

export async function sendBookingConfirmation(params: {
  booking: {
    id: string;
    title: string;
    description?: string | null;
    startsAt: Date;
    endsAt: Date;
    meetLink?: string | null;
    timezone: string;
  };
  host: { email: string; name?: string | null };
  invitee: { email: string; name?: string | null };
}) {
  const link = `${baseUrl()}/bookings/${params.booking.id}`;
  const when = params.booking.startsAt.toUTCString();
  const subject = `Booking confirmed: ${params.booking.title}`;
  const meetLine = params.booking.meetLink
    ? `\nGoogle Meet: ${params.booking.meetLink}`
    : "";
  const body = `Your booking is confirmed.\n\n${params.booking.title}\n${when}${meetLine}\n\nOpen: ${link}\n`;

  const icsInput: IcsBookingInput = {
    uid: params.booking.id,
    title: params.booking.title,
    description: params.booking.description,
    startsAt: params.booking.startsAt,
    endsAt: params.booking.endsAt,
    hostEmail: params.host.email,
    hostName: params.host.name ?? null,
    attendees: [
      { email: params.invitee.email, name: params.invitee.name ?? null },
      { email: params.host.email, name: params.host.name ?? null },
    ],
    meetLink: params.booking.meetLink ?? null,
    method: "REQUEST",
    status: "CONFIRMED",
  };
  const ics = buildBookingIcs(icsInput);
  const attachment = { filename: "booking.ics", content: ics };

  await send({ to: params.invitee.email, subject, text: body, ics: attachment });
  if (params.host.email && params.host.email !== params.invitee.email) {
    await send({ to: params.host.email, subject, text: body, ics: attachment });
  }
}

export async function sendBookingReschedule(params: {
  oldBooking: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
  };
  newBooking: {
    id: string;
    title: string;
    description?: string | null;
    startsAt: Date;
    endsAt: Date;
    meetLink?: string | null;
    timezone: string;
  };
  host: { email: string; name?: string | null };
  invitee: { email: string; name?: string | null };
  rescheduledBy: "HOST" | "INVITEE";
}) {
  const link = `${baseUrl()}/bookings/${params.newBooking.id}`;
  const oldWhen = params.oldBooking.startsAt.toUTCString();
  const newWhen = params.newBooking.startsAt.toUTCString();
  const by = params.rescheduledBy === "HOST" ? "host" : "invitee";
  const subject = `Booking rescheduled: ${params.newBooking.title}`;
  const meetLine = params.newBooking.meetLink
    ? `\nGoogle Meet: ${params.newBooking.meetLink}`
    : "";
  const body = `Your booking has been rescheduled by the ${by}.\n\nOld time: ${oldWhen}\nNew time: ${newWhen}${meetLine}\n\nOpen: ${link}\n`;

  const icsInput: IcsBookingInput = {
    uid: params.newBooking.id,
    title: params.newBooking.title,
    description: params.newBooking.description,
    startsAt: params.newBooking.startsAt,
    endsAt: params.newBooking.endsAt,
    hostEmail: params.host.email,
    hostName: params.host.name ?? null,
    attendees: [
      { email: params.invitee.email, name: params.invitee.name ?? null },
      { email: params.host.email, name: params.host.name ?? null },
    ],
    meetLink: params.newBooking.meetLink ?? null,
    method: "REQUEST",
    status: "CONFIRMED",
  };
  const ics = buildBookingIcs(icsInput);
  const attachment = { filename: "booking.ics", content: ics };

  await send({ to: params.invitee.email, subject, text: body, ics: attachment });
  if (params.host.email && params.host.email !== params.invitee.email) {
    await send({ to: params.host.email, subject, text: body, ics: attachment });
  }
}

export async function sendBookingCancellation(params: {
  booking: {
    id: string;
    title: string;
    description?: string | null;
    startsAt: Date;
    endsAt: Date;
    meetLink?: string | null;
    timezone: string;
    cancelReason?: string | null;
  };
  host: { email: string; name?: string | null };
  invitee: { email: string; name?: string | null };
  cancelledBy: "HOST" | "INVITEE";
}) {
  const subject = `Booking cancelled: ${params.booking.title}`;
  const who = params.cancelledBy === "HOST" ? "host" : "invitee";
  const reason = params.booking.cancelReason
    ? `\nReason: ${params.booking.cancelReason}`
    : "";
  const body = `Your booking has been cancelled by the ${who}.\n\n${params.booking.title}\n${params.booking.startsAt.toUTCString()}${reason}\n`;

  const icsInput: IcsBookingInput = {
    uid: params.booking.id,
    title: params.booking.title,
    description: params.booking.description,
    startsAt: params.booking.startsAt,
    endsAt: params.booking.endsAt,
    hostEmail: params.host.email,
    hostName: params.host.name ?? null,
    attendees: [
      { email: params.invitee.email, name: params.invitee.name ?? null },
      { email: params.host.email, name: params.host.name ?? null },
    ],
    meetLink: params.booking.meetLink ?? null,
    method: "CANCEL",
    status: "CANCELLED",
  };
  const ics = buildBookingIcs(icsInput);
  const attachment = { filename: "cancel.ics", content: ics };

  await send({ to: params.invitee.email, subject, text: body, ics: attachment });
  if (params.host.email && params.host.email !== params.invitee.email) {
    await send({ to: params.host.email, subject, text: body, ics: attachment });
  }
}
