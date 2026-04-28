import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasCapability } from "@/server/capabilities";
import { StepsEditor } from "./_components/StepsEditor";

export default async function OnboardingAdminPage({
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
    capability: "ONBOARDING_EDIT",
  });
  if (!allowed) notFound();

  const config = await db.onboardingConfig.findUnique({
    where: { groupId: group.id },
  });

  let steps: Array<{ target: string; title: string; body: string; order: number }> = [];
  if (config) {
    try {
      steps = JSON.parse(config.steps);
    } catch {
      steps = [];
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Onboarding tour</h1>
        <p className="text-sm text-muted-foreground">
          Configure an interactive tour shown once to new members. Use CSS
          selectors as targets (e.g. <code>[data-tour=&quot;feed&quot;]</code>) to highlight icons.
        </p>
      </div>
      <StepsEditor
        groupId={group.id}
        initialEnabled={config?.enabled ?? false}
        initialSteps={steps}
      />
    </div>
  );
}
