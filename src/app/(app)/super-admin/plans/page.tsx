/**
 * /super-admin/plans — Manage SaaS plan configurations.
 * Edit prices, limits, and feature lists without redeploying.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/super-admin";
import { getPlanConfigs } from "@/server/plan-configs";
import { PlanConfigsClient } from "@/components/admin/PlanConfigsClient";
import { Info } from "lucide-react";

export default async function SuperAdminPlansPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isSuperAdmin(session.user.id))) redirect("/");

  const plans = await getPlanConfigs();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plan Configuration</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Edit plan prices, limits, and features. Changes are live immediately — no redeploy needed.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">Limits</strong> apply to <em>new</em> tenants when they subscribe to a plan.
            Existing tenants keep their stored limits until you manually update them from the Tenants page.
          </p>
          <p>
            Set any limit to <strong className="text-foreground">−1</strong> to make it unlimited.
            Use the <strong className="text-foreground">Reset</strong> button (↺) to restore a plan to factory defaults.
          </p>
        </div>
      </div>

      <PlanConfigsClient initialRows={plans} />
    </div>
  );
}
