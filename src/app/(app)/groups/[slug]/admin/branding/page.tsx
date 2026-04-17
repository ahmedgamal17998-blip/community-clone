import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { BrandingForm } from "@/components/admin/BrandingForm";

export default async function AdminBrandingPage({
  params,
}: {
  params: { slug: string };
}) {
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      coverUrl: true,
      primaryHsl: true,
    },
  });
  if (!group) notFound();

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Branding</h1>
        <p className="text-sm text-muted-foreground">
          Logo, cover, and primary color for this group.
        </p>
      </div>
      <BrandingForm
        groupId={group.id}
        initial={{
          name: group.name,
          logoUrl: group.logoUrl,
          coverUrl: group.coverUrl,
          primaryHsl: group.primaryHsl,
        }}
      />
    </section>
  );
}
