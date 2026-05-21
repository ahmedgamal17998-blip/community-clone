/**
 * /admin/setup — One-time workspace & first-group setup.
 * Shown automatically when a user has no tenant yet, or has a tenant but no groups.
 */
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { AdminSetupClient } from "@/components/admin/AdminSetupClient";

export default async function AdminSetupPage({
  searchParams,
}: {
  searchParams: { step?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await db.tenant.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, name: true, slug: true, _count: { select: { groups: true } } },
  });

  // Only OWNER account types or existing tenant owners can access setup.
  const accountType = (session.user as any).accountType as string | undefined;
  if (!tenant && accountType !== "OWNER") redirect("/home");

  // Already fully set up → back to admin
  if (tenant && tenant._count.groups > 0) redirect("/admin");

  return (
    <div className="mx-auto max-w-lg py-12 px-4">
      <AdminSetupClient tenant={tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null} />
    </div>
  );
}
