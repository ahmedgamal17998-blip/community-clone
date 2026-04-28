"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
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

type Props = {
  name: string | null;
  email: string | null;
  image: string | null;
  handle: string;
};

export function UserMenu({ name, email, image, handle }: Props) {
  const t = useTranslations("nav");
  const tabs = useTranslations("groups.tabs");
  const pathname = usePathname();

  // Detect current group context: /groups/<slug>/...
  const groupMatch = pathname.match(/^\/groups\/([^/]+)/);
  const currentGroupSlug = groupMatch ? groupMatch[1] : null;

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
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{name ?? email}</span>
          <span className="text-xs text-muted-foreground">@{handle}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/profile/${handle}`}>{t("profile")}</Link>
        </DropdownMenuItem>
        {currentGroupSlug && (
          <DropdownMenuItem asChild>
            <Link href={`/groups/${currentGroupSlug}/me`}>{tabs("mySubscription")}</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">{t("settings")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/" })}>
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
