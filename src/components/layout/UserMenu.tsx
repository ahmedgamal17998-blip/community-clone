"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { LayoutDashboard, LogOut, DoorOpen, Building2, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { leaveGroupAction } from "@/server/groups";

type CurrentGroup = {
  slug: string;
  name: string;
  /** Viewer is admin/owner of this group → show "Admin dashboard" entry. */
  canManage: boolean;
  /** Viewer can leave (true for non-OWNER members). */
  canLeave: boolean;
} | null;

type Props = {
  name: string | null;
  email: string | null;
  image: string | null;
  handle: string;
  /** Current group context when the viewer is on a /groups/<slug> route. */
  currentGroup?: CurrentGroup;
};

export function UserMenu({ name, email, image, handle, currentGroup }: Props) {
  const t = useTranslations("nav");
  const tabs = useTranslations("groups.tabs");
  const pathname = usePathname();

  // Fallback: if the parent didn't pass a server-resolved currentGroup
  // (e.g. on routes outside /groups), still detect the slug from path
  // so My-subscription stays linkable.
  const groupMatch = pathname.match(/^\/groups\/([^/]+)/);
  const currentGroupSlug = currentGroup?.slug ?? groupMatch?.[1] ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        aria-label={name ?? email ?? "Account"}
      >
        <Avatar className="h-9 w-9">
          {image ? <AvatarImage src={image} alt={name ?? ""} /> : null}
          <AvatarFallback>{initialsFrom(name ?? email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[16rem]">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">
            {name ?? email}
          </span>
          <span className="text-xs text-muted-foreground">@{handle}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/profile/${handle}`}>{t("profile")}</Link>
        </DropdownMenuItem>
        {currentGroupSlug && (
          <DropdownMenuItem asChild>
            <Link href={`/groups/${currentGroupSlug}/me`}>
              {tabs("mySubscription")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">{t("settings")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/owner/dashboard" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            My communities
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/admin" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Workspace admin
          </Link>
        </DropdownMenuItem>

        {/* Group context — Admin dashboard + Leave group, only when the
            server resolved the viewer's role for the current group. */}
        {currentGroup && (currentGroup.canManage || currentGroup.canLeave) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {currentGroup.name}
            </DropdownMenuLabel>
            {currentGroup.canManage && (
              <DropdownMenuItem asChild>
                <Link
                  href={`/groups/${currentGroup.slug}/admin`}
                  className="flex items-center gap-2"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Admin dashboard
                </Link>
              </DropdownMenuItem>
            )}
            {currentGroup.canLeave && (
              <form action={leaveGroupAction}>
                <input
                  type="hidden"
                  name="groupSlug"
                  value={currentGroup.slug}
                />
                <button
                  type="submit"
                  className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
                >
                  <DoorOpen className="h-4 w-4" />
                  Leave group
                </button>
              </form>
            )}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOut({ callbackUrl: "/" })}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
