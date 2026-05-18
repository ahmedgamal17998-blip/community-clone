/**
 * /super-admin/settings — Platform-level configuration.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/super-admin";
import { getPlatformSettingsForPage } from "@/server/platform-settings";
import { SuperAdminSettingsClient } from "@/components/admin/SuperAdminSettingsClient";

export default async function SuperAdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isSuperAdmin(session.user.id))) redirect("/");

  const settings = await getPlatformSettingsForPage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure platform-level options that affect all workspaces.
        </p>
      </div>
      <SuperAdminSettingsClient {...settings} />
    </div>
  );
}
