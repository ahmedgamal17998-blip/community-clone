import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { AvailabilityForm } from "@/components/booking/AvailabilityForm";
import { parseRules } from "@/server/booking-slots";

export default async function AvailabilityPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const existing = await db.availability.findUnique({
    where: { userId: session.user.id },
  });

  const initial = existing
    ? {
        timezone: existing.timezone,
        slotLengthMin: existing.slotLengthMin,
        bufferMin: existing.bufferMin,
        minNoticeHours: existing.minNoticeHours,
        maxPerDay: existing.maxPerDay,
        bookableScope: existing.bookableScope as "EVERYONE" | "CONTRIBUTORS" | "ADMINS",
        rules: parseRules(existing.rules),
      }
    : null;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Availability</h1>
        <p className="text-sm text-muted-foreground">
          Set the hours when others can book time with you. Bookings create a
          Google Calendar event with a Meet link (if Google is connected).
        </p>
      </header>
      <AvailabilityForm initial={initial} />
    </section>
  );
}
