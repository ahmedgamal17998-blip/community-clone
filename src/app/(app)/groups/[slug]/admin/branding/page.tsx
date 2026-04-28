import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { BrandingForm } from "@/components/admin/BrandingForm";
import { FaviconUploader } from "./_components/FaviconUploader";

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
      faviconUrl: true,
    },
  });
  if (!group) notFound();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Branding</h1>
        <p className="text-sm text-muted-foreground">
          Logo, cover, primary color, and favicon for this group.
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
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Favicon</h2>
        <FaviconUploader groupId={group.id} initialUrl={group.faviconUrl ?? null} />
      </div>
    </section>
  );
}
