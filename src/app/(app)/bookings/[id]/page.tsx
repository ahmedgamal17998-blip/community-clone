import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { CancelBookingButton } from "@/components/booking/CancelBookingButton";
import { ReschedulePanel } from "@/components/booking/ReschedulePanel";
import { computeAvailableSlots } from "@/server/booking-slots";

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { rescheduled?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const b = await db.booking.findUnique({
    where: { id: params.id },
    include: {
      host: { select: { id: true, name: true, handle: true, email: true, availability: true } },
      invitee: { select: { id: true, name: true, handle: true, email: true } },
      group: { select: { slug: true, name: true } },
      rescheduledFrom: { select: { id: true } },
      rescheduledTo: { select: { id: true } },
    },
  });
  if (!b) notFound();

  const me = session.user.id;
  if (b.hostId !== me && b.inviteeId !== me) notFound();

  const isCancelled = b.status === "CANCELLED";
  const isRescheduled = b.status === "RESCHEDULED";
  const isDone = isCancelled || isRescheduled;
  const canAct = !isDone && (b.hostId === me || b.inviteeId === me);

  // Fetch slots for reschedule picker (only if can reschedule)
  let slots: { startsAt: string; endsAt: string }[] = [];
  if (canAct) {
    const from = new Date();
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const rawSlots = await computeAvailableSlots({ hostUserId: b.hostId, from, to });
    slots = rawSlots.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    }));
  }

  const wasRescheduled = searchParams?.rescheduled === "1";

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      {wasRescheduled ? (
        <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          Booking successfully rescheduled!
        </div>
      ) : null}

      <header>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
              isCancelled
                ? "bg-destructive/10 text-destructive"
                : isRescheduled
                ? "bg-amber-600/10 text-amber-700 dark:text-amber-300"
                : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {b.status}
          </span>
          {b.group ? (
            <Link
              href={`/groups/${b.group.slug}`}
              className="text-muted-foreground hover:underline"
            >
              via {b.group.name}
            </Link>
          ) : null}
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{b.title}</h1>
      </header>

      <div className="rounded-xl border border-border bg-card p-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">When</dt>
          <dd>
            {b.startsAt.toLocaleString()} →{" "}
            {b.endsAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            <span className="ms-2 text-xs text-muted-foreground">
              ({b.timezone})
            </span>
          </dd>

          <dt className="text-muted-foreground">Host</dt>
          <dd>
            <Link href={`/profile/${b.host.handle}`} className="hover:underline">
              {b.host.name ?? "@" + b.host.handle}
            </Link>
          </dd>

          <dt className="text-muted-foreground">Invitee</dt>
          <dd>
            {b.invitee ? (
              <Link
                href={`/profile/${b.invitee.handle}`}
                className="hover:underline"
              >
                {b.invitee.name ?? "@" + b.invitee.handle}
              </Link>
            ) : (
              <span>{b.inviteeEmail}</span>
            )}
          </dd>

          {b.description ? (
            <>
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap">{b.description}</dd>
            </>
          ) : null}

          {b.meetLink && !isDone ? (
            <>
              <dt className="text-muted-foreground">Meet</dt>
              <dd>
                <a
                  href={b.meetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {b.meetLink}
                </a>
              </dd>
            </>
          ) : null}

          {isCancelled ? (
            <>
              <dt className="text-muted-foreground">Cancelled at</dt>
              <dd>{b.cancelledAt?.toLocaleString() ?? "—"}</dd>
              {b.cancelReason ? (
                <>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd>{b.cancelReason}</dd>
                </>
              ) : null}
            </>
          ) : null}

          {isRescheduled && b.rescheduledTo ? (
            <>
              <dt className="text-muted-foreground">Rescheduled to</dt>
              <dd>
                <Link href={`/bookings/${b.rescheduledTo.id}`} className="text-primary hover:underline">
                  View new booking
                </Link>
              </dd>
            </>
          ) : null}

          {b.rescheduledFrom ? (
            <>
              <dt className="text-muted-foreground">Rescheduled from</dt>
              <dd>
                <Link href={`/bookings/${b.rescheduledFrom.id}`} className="text-muted-foreground hover:underline text-xs">
                  View original booking
                </Link>
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <a href={`/api/bookings/${b.id}/ics`}>Add to calendar (.ics)</a>
        </Button>
        {canAct ? <CancelBookingButton bookingId={b.id} /> : null}
      </div>

      {canAct && slots.length > 0 ? (
        <ReschedulePanel
          bookingId={b.id}
          currentTitle={b.title}
          currentDescription={b.description ?? ""}
          slots={slots}
          hostHandle={b.host.handle}
        />
      ) : null}
    </section>
  );
}
