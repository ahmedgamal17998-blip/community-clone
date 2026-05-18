/**
 * /create — redirects to the workspace setup wizard.
 * Kept for backward compatibility (links, bookmarks).
 */
import { redirect } from "next/navigation";

export default function CreatePage() {
  redirect("/admin/setup");
}
