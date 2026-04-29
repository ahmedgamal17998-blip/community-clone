import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";

/**
 * Legacy redirect — access rules now live under /learning/<courseSlug>/access
 * (no Admin Dashboard sidebar, with a clean back arrow to the outline).
 */
export default async function LegacyCourseAccessRedirect({
  params,
}: {
  params: { slug: string; courseId: string };
}) {
  const course = await db.course.findUnique({
    where: { id: params.courseId },
    select: { slug: true, group: { select: { slug: true } } },
  });
  if (!course) notFound();
  redirect(`/groups/${course.group.slug}/learning/${course.slug}/access`);
}
