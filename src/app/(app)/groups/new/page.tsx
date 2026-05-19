import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Lock, Zap } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { TENANT_PLAN_LIMITS } from "@/server/billing/plans";
import type { Plan } from "@/lib/plans";
import { CreateGroupForm } from "@/components/group/CreateGroupForm";

export default async function NewGroupPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("groups.wizard");

  // Gate: only tenant owners can create groups.
  const tenant = await db.tenant.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, plan: true, currentGroups: true, groupLimit: true },
  });

  if (!tenant) {
    redirect("/create"); // no workspace yet → setup wizard
  }

  // Pre-check group limit — show upgrade screen before form.
  const planLimits = TENANT_PLAN_LIMITS[tenant.plan as Plan];
  const groupLimit = tenant.groupLimit ?? planLimits.maxGroups;
  const isAtLimit = groupLimit !== -1 && tenant.currentGroups >= groupLimit;

  if (isAtLimit) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold">Group limit reached</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Your <span className="font-medium">{tenant.plan}</span> plan allows up to{" "}
          <span className="font-medium">{groupLimit} group{groupLimit !== 1 ? "s" : ""}</span>.
          Upgrade your plan to create more groups.
        </p>
        <div className="mt-5 flex gap-3">
          <Link
            href="/admin/billing"
            className="inline-flex items-center gap-1.5 justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Zap className="h-3.5 w-3.5" />
            Upgrade plan
          </Link>
          <Link
            href="/groups"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
          >
            Back to groups
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <CreateGroupForm />
    </section>
  );
}
