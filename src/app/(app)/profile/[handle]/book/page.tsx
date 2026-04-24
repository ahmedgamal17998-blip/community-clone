import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { computeAvailableSlots } from "@/server/booking-slots";
import { BookingPicker } from "@/components/booking/BookingPicker";
import { GuestBookingPicker } from "@/components/booking/GuestBookingPicker";

export default async function BookProfilePage({
  params,
  searchParams,
}: {
  params: { handle: string };
  searchParams?: { groupId?: string; email?: string; name?: string };
}) {
  const session = await auth();

  const handle = params.handle.replace(/^@/, "");
  const host = await db.user.findUnique({
    where: { handle },
    select: {
      id: true,
      name: true,
      handle: true,
      image: true,
      availability: true,
      googleAccount: { select: { email: true } },
    },
  });
  if (!host) notFound();

  if (session?.user && host.id === session.user.id) {
    return (
      <section className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-lg font-semibold">That&apos;s you!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You can&apos;t book time with yourself. Share this page with others.
        </p>
      </section>
    );
  }

  if (!host.availability) {
    return (
      <section className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-lg font-semibold">
          {host.name} hasn&apos;t set their availability yet
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Check back later or ping them directly.
        </p>
        <Link
          href={`/profile/${host.handle}`}
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          ← Back to profile
        </Link>
      </section>
    );
  }

  const from = new Date();
  const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const slots = await computeAvailableSlots({
    hostUserId: host.id,
    from,
    to,
  });

  const slotsStr = slots.map((s) => ({
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
  }));

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Book a session with {host.name}</h1>
          <p className="text-sm text-muted-foreground">
            Timezone: {host.availability.timezone} · Slot:{" "}
            {host.availability.slotLengthMin} min
          </p>
        </div>
      </header>

      {!session?.user ? (
        <div className="rounded-md border border-blue-600/40 bg-blue-600/10 p-3 text-sm text-blue-800 dark:text-blue-200">
          <strong>No account needed.</strong> Book as a guest below — just enter your name and email.{" "}
          <Link href={`/login?next=/profile/${host.handle}/book`} className="underline hover:no-underline">
            Sign in
          </Link>{" "}
          if you have an account.
        </div>
      ) : null}

      {!host.googleAccount ? (
        <div className="rounded-md border border-amber-600/40 bg-amber-600/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          Heads up: this host hasn&apos;t connected Google Calendar. Bookings
          will still be created, but no Meet link will be auto-generated and
          conflicts with their Google calendar won&apos;t be detected.
        </div>
      ) : null}

      {slots.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No slots available in the next 14 days. Try again later.
          </p>
        </div>
      ) : session?.user ? (
        <BookingPicker
          hostHandle={host.handle}
          hostName={host.name ?? host.handle}
          slots={slotsStr}
          groupId={searchParams?.groupId ?? null}
        />
      ) : (
        <GuestBookingPicker
          hostHandle={host.handle}
          hostName={host.name ?? host.handle}
          slots={slotsStr}
          groupId={searchParams?.groupId ?? null}
          prefillEmail={searchParams?.email ?? ""}
          prefillName={searchParams?.name ?? ""}
        />
      )}
    </section>
  );
}
