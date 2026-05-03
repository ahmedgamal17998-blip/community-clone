import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { listOfferingsForViewer } from "@/server/booking-offerings";
import { BookingEmbedClient } from "./_components/BookingEmbedClient";

export const dynamic = "force-dynamic";

type SearchParams = { o?: string };

export default async function BookPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      name: true,
      bookingButtonEnabled: true,
      bookingButtonLabel: true,
    },
  });
  if (!group) notFound();
  // Page is gated on the admin enabling the booking button.
  if (!group.bookingButtonEnabled) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { state: true },
  });
  if (!me || me.state !== "ACTIVE") notFound();

  const offerings = await listOfferingsForViewer({
    groupId: group.id,
    userId: session.user.id,
  });

  // Pick the offering to render in the iframe. Default = first ACCESS-able
  // offering. ?o=<id> overrides if the user clicked a specific card.
  const requestedId = searchParams?.o;
  let selected =
    (requestedId && offerings.find((o) => o.id === requestedId)) || null;
  if (!selected) {
    selected = offerings.find((o) => o.state === "ACCESS") ?? null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/groups/${group.slug}/events`}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">{group.bookingButtonLabel}</h1>
          <p className="text-xs text-muted-foreground">
            {group.name} · Bookings
          </p>
        </div>
      </div>

      {offerings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No bookable sessions are available right now.
        </div>
      ) : (
        <BookingEmbedClient
          groupSlug={group.slug}
          offerings={offerings.map((o) => ({
            id: o.id,
            label: o.label,
            tooltipText: o.tooltipText,
            state: o.state,
          }))}
          initialSelectedId={selected?.id ?? null}
          initialAccessible={selected?.state === "ACCESS"}
        />
      )}
    </div>
  );
}
