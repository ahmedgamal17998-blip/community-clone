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
    select: { id: true, slug: true },
  });
  if (!group) notFound();

  const allowed = await hasCapability({
    userId: session.user.id,
    groupId: group.id,
    capability: "SUBS_MANAGE",
  });
  if (!allowed) notFound();

  const plans = await db.subscriptionPlan.findMany({
    where: { groupId: group.id },
    orderBy: [{ active: "desc" }, { priceCents: "asc" }],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Subscription plans</h1>
      <p className="text-sm text-muted-foreground">
        Configure plans members can subscribe to. Payment runs through your
        custom payment system; this page manages the plan catalog and
        subscription state.
      </p>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Create new plan</h2>
        <PlanForm groupId={group.id} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Existing plans</h2>
        <PlanList groupId={group.id} plans={plans} />
      </section>
    </div>
  );
}
