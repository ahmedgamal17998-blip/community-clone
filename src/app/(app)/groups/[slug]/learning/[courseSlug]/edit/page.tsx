import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { CourseForm } from "@/components/courses/CourseForm";

export default async function EditCoursePage({
  params,
}: {
  params: { slug: string; courseSlug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!group) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    notFound();
  }

  const course = await db.course.findUnique({
    where: { groupId_slug: { groupId: group.id, slug: params.courseSlug } },
  });
  if (!course) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href={`/groups/${params.slug}/learning/${params.courseSlug}`}
          aria-label="Back to course"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-semibold">Edit course</h1>
      </header>
      <CourseForm
        mode="edit"
        groupId={group.id}
        course={{
          id: course.id,
          title: course.title,
          description: course.description,
          coverUrl: course.coverUrl,
          priceType: course.priceType,
          priceLabel: course.priceLabel,
          stripePriceId: course.stripePriceId,
          priceAmount: course.priceAmount,
          currency: course.currency,
          tier: course.tier,
          published: course.published,
        }}
      />
    </div>
  );
}
