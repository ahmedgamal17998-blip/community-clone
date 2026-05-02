import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { PlanForm } from "./_components/PlanForm";
import { PlanList } from "./_components/PlanList";

export default async function PlansAdminPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true, tracksEnabled: true },
  });
  if (!group) notFound();

  const allowed = await hasCapability({
    userId: session.user.id,
    groupId: group.id,
    capability: "SUBS_MANAGE",
  });
  if (!allowed) notFound();

  const [plans, channels, courses, planResources, tracks] = await Promise.all([
    db.subscriptionPlan.findMany({
      where: { groupId: group.id },
      orderBy: [{ active: "desc" }, { priceCents: "asc" }],
    }),
    db.channel.findMany({
      where: { groupId: group.id, archived: false },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, name: true, tier: true, kind: true },
    }),
    db.course.findMany({
      where: { groupId: group.id },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, title: true, tier: true },
    }),
    db.planResource.findMany({
      where: { plan: { groupId: group.id } },
      select: { planId: true, resourceType: true, resourceId: true },
    }),
    db.track.findMany({
      where: { groupId: group.id, archived: false },
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Group PlanResources by plan id for the editor.
  const resourcesByPlan: Record<
    string,
    { channelIds: string[]; courseIds: string[]; eventIds: string[] }
  > = {};
  for (const p of plans) {
    resourcesByPlan[p.id] = { channelIds: [], courseIds: [], eventIds: [] };
  }
  for (const r of planResources) {
    const bucket = resourcesByPlan[r.planId];
    if (!bucket) continue;
    if (r.resourceType === "CHANNEL") bucket.channelIds.push(r.resourceId);
    else if (r.resourceType === "COURSE") bucket.courseIds.push(r.resourceId);
    else if (r.resourceType === "EVENT") bucket.eventIds.push(r.resourceId);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Subscription plans</h1>
      <p className="text-sm text-muted-foreground">
        Configure plans members can subscribe to. Each plan unlocks a chosen
        set of channels and courses on activation.
      </p>

      {/* Themed card matching LoginPopup pattern */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
          }}
        />
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold text-foreground">
            Create new plan
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Set price + duration, then pick the channels / courses members get
            access to when they subscribe.
          </p>
          <PlanForm groupId={group.id} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Existing plans</h2>
        <PlanList
          groupId={group.id}
          plans={plans}
          channels={channels}
          courses={courses}
          tracks={tracks}
          tracksEnabled={group.tracksEnabled}
          resourcesByPlan={resourcesByPlan}
        />
      </section>
    </div>
  );
}
