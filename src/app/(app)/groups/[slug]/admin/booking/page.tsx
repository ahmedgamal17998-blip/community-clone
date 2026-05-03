import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { BookingAdminClient } from "./_components/BookingAdminClient";

export const dynamic = "force-dynamic";

export default async function BookingAdminPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      bookingButtonEnabled: true,
      bookingButtonLabel: true,
      bookingButtonTooltip: true,
    },
  });
  if (!group) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    notFound();
  }

  const offerings = await db.bookingOffering.findMany({
    where: { groupId: group.id },
    orderBy: [{ archived: "asc" }, { position: "asc" }],
    select: {
      id: true,
      label: true,
      tooltipText: true,
      instructorSlug: true,
      eventSlug: true,
      tier: true,
      visibility: true,
      archived: true,
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Expose your Booky event types to members. Premium offerings unlock
          via the same plan picker that gates channels and courses, and
          subscribers book without re-entering their name or email.
        </p>
      </header>

      <BookingAdminClient
        groupId={group.id}
        groupSlug={group.slug}
        settings={{
          enabled: group.bookingButtonEnabled,
          label: group.bookingButtonLabel,
          tooltip: group.bookingButtonTooltip,
        }}
        offerings={offerings}
      />
    </div>
  );
}
