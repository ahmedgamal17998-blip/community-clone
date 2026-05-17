/**
 * /create — redirects to the full onboarding wizard.
 * Kept for backward compatibility (links, bookmarks).
 */
import { redirect } from "next/navigation";

export default function CreatePage() {
  redirect("/onboarding");
}
