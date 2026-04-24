import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { buildGuestToken } from "@/lib/guest-token";
import { Button } from "@/components/ui/button";

export default async function GuestBookingConfirmPage({
  params,
  searchParams,
}: {
  params: { handle: string };
  searchParams?: { bookingId?: string; token?: string };
}) {
  const { bookingId, token } = searchParams ?? {};
  if (!bookingId || !token) notFound();

  // Verify HMAC token to prevent enumeration
  const expected = buildGuestToken(bookingId);
  if (token !== expected) notFound();

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      host: { select: { name: true, handle: true } },
    },
  });
  if (!booking) notFound();

  const icsUrl = `/api/bookings/${bookingId}/ics`;

  return (
    <section className="mx-auto max-w-xl space-y-6 py-10">
      <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-4 text-emerald-800 dark:text-emerald-200">
        <h1 className="text-lg font-semibold">Booking confirmed!</h1>
        <p className="mt-1 text-sm">
          A confirmation email has been sent to <strong>{booking.inviteeEmail}</strong>.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Title</dt>
          <dd className="font-medium">{booking.title}</dd>

          <dt className="text-muted-foreground">When</dt>
          <dd>
            {booking.startsAt.toLocaleString()} →{" "}
            {booking.endsAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            <span className="ms-2 text-xs text-muted-foreground">
              ({booking.timezone})
            </span>
          </dd>

          <dt className="text-muted-foreground">Host</dt>
          <dd>
            <Link href={`/profile/${booking.host.handle}`} className="hover:underline">
              {booking.host.name ?? "@" + booking.host.handle}
            </Link>
          </dd>

          {booking.description ? (
            <>
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap">{booking.description}</dd>
            </>
          ) : null}

          {booking.meetLink ? (
            <>
              <dt className="text-muted-foreground">Meet</dt>
              <dd>
                <a
                  href={booking.meetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {booking.meetLink}
                </a>
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <a href={icsUrl}>Add to calendar (.ics)</a>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/profile/${params.handle}`}>
            Back to profile
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Sign up free
        </Link>{" "}
        to manage bookings and see your schedule.
      </p>
    </section>
  );
}
