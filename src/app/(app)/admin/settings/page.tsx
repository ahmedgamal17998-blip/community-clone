/**
 * /admin/settings — Tenant-level settings (name, billing email, custom domain).
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { TenantSettingsClient } from "@/components/admin/TenantSettingsClient";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await db.tenant.findFirst({
    where: { ownerId: session.user.id },
    select: {
      id: true, name: true, slug: true,
      billingEmail: true, customDomain: true,
      plan: true,
    },
  });
  if (!tenant) redirect("/admin/setup");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure your workspace settings.
        </p>
      </div>

      <TenantSettingsClient
        tenant={{
          id:           tenant.id,
          name:         tenant.name,
          slug:         tenant.slug,
          billingEmail: tenant.billingEmail ?? "",
          customDomain: tenant.customDomain ?? "",
          plan:         tenant.plan,
        }}
      />
    </div>
  );
}
