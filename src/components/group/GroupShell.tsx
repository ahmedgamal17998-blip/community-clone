"use client";

/**
 * GroupShell — client component that decides whether to render the
 * Channels sidebar based on the current pathname.
 *
 * The Channels sidebar only makes sense on the Discussion tab (and inside
 * its sub-routes like /channels/<slug>). On Learning / Events / Leaderboard
 * / About / Members / Admin / Me etc. it's hidden and the grid collapses to
 * 2 columns so the middle content has room to breathe.
 */
import { usePathname } from "next/navigation";

type Props = {
  groupSlug: string;
  leftSidebar: React.ReactNode;
  rightRail: React.ReactNode;
  children: React.ReactNode;
};

export function GroupShell({ groupSlug, leftSidebar, rightRail, children }: Props) {
  const pathname = usePathname();
  const base = `/groups/${groupSlug}`;

  // Discussion: the bare group root, or any /channels/* route under it.
  // Anything else (learning / events / leaderboard / members / about /
  // admin / me) hides the channels sidebar.
  const isDiscussion =
    pathname === base ||
    pathname === `${base}/` ||
    pathname.startsWith(`${base}/channels`);

  return (
    <div
      className={
        isDiscussion
          ? "mx-auto grid w-full max-w-[1280px] grid-cols-1 items-start gap-6 px-3 py-6 sm:px-4 lg:grid-cols-[240px_1fr_280px]"
          : "mx-auto grid w-full max-w-[1280px] grid-cols-1 items-start gap-6 px-3 py-6 sm:px-4 lg:grid-cols-[1fr_280px]"
      }
    >
      {isDiscussion ? leftSidebar : null}
      <div className="min-w-0">{children}</div>
      {rightRail}
    </div>
  );
}
