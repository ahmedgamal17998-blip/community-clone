import { redirect } from "next/navigation";

/**
 * Legacy route — kept as a redirect so old bookmarks / links keep working.
 * The single source of truth for group settings is now the admin dashboard:
 *   /groups/<slug>/admin/settings
 */
export default function LegacyGroupSettingsRedirect({
  params,
}: {
  params: { slug: string };
}) {
  redirect(`/groups/${params.slug}/admin/settings`);
}
