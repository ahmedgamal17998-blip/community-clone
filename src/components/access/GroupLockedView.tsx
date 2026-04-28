/**
 * Shown to a member whose group access is locked or expired.
 * Replaces the normal group content (sidebar + feed + rail).
 *
 * Professional + simple: a single centered card with a clear message,
 * the group name for context, and a link to the member's subscription page.
 */
import Link from "next/link";
import { Lock } from "lucide-react";

type Props = {
  groupSlug: string;
  groupName: string;
  reason: "LOCKED" | "EXPIRED";
};

export function GroupLockedView({ groupSlug, groupName, reason }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] items-center justify-center px-4 py-16">
      <div className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold">
          {reason === "LOCKED"
            ? "Your access has been paused"
            : "Your access has expired"}
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
          {reason === "LOCKED"
            ? `An admin has temporarily paused your access to ${groupName}. Reach out to the admins to restore it.`
            : `Your subscription to ${groupName} has ended. Renew or contact an admin to extend it.`}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href={`/groups/${groupSlug}/me`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            View my subscription
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
