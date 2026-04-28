import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Lock } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { CreateGroupForm } from "@/components/group/CreateGroupForm";

export default async function NewGroupPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("groups.wizard");

  // SaaS gate — only users with canCreateGroups can reach this form.
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { canCreateGroups: true },
  });
  if (!me?.canCreateGroups) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold">Owner subscription required</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Creating a community is reserved for owners. Once subscriptions go
          live you'll be able to upgrade here. For now, contact the platform
          owner to request access.
        </p>
        <Link
          href="/groups"
          className="mt-5 inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
        >
          Back to groups
        </Link>
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
