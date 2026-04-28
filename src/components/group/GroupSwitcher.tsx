/**
 * Top-left group switcher — dropdown matching the chrome we audited.
 *
 * - Server-rendered initial state (current group badge when inside /groups/:slug,
 *   otherwise "All groups").
 * - Dropdown items are plain links — navigating triggers a server render.
 */
import Link from "next/link";
import { ChevronsUpDown, Plus, Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { listMyGroups } from "@/server/group-queries";
import { GroupAvatar } from "@/components/group/GroupAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  activeSlug?: string;
};

export async function GroupSwitcher({ activeSlug }: Props) {
  const session = await auth();
  if (!session?.user) return null;
  const t = await getTranslations("groups");

  const [myGroups, me] = await Promise.all([
    listMyGroups(session.user.id),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { canCreateGroups: true },
    }),
  ]);
  const canCreate = !!me?.canCreateGroups;
  const active = activeSlug
    ? myGroups.find((g) => g.slug === activeSlug)
    : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2 text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("switcherLabel")}
        >
          {active ? (
            <>
              <GroupAvatar name={active.name} logoUrl={active.logoUrl} primaryHsl={active.primaryHsl} size="sm" />
              <span className="max-w-[160px] truncate font-medium">{active.name}</span>
            </>
          ) : (
            <>
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Compass className="h-4 w-4" />
              </div>
              <span className="font-medium">{t("switcherAll")}</span>
            </>
          )}
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t("yourGroups")}</DropdownMenuLabel>
        {myGroups.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t("noneYet")}</div>
        ) : (
          myGroups.map((g) => (
            <DropdownMenuItem key={g.id} asChild className="gap-2">
              <Link href={`/groups/${g.slug}`}>
                <GroupAvatar name={g.name} logoUrl={g.logoUrl} primaryHsl={g.primaryHsl} size="sm" />
                <span className="flex-1 truncate">{g.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {g.state === "REQUESTED" ? t("pending") : g.role}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/groups">
            <Compass className="h-4 w-4" />
            <span>{t("discover")}</span>
          </Link>
        </DropdownMenuItem>
        {canCreate && (
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/groups/new">
              <Plus className="h-4 w-4" />
              <span>{t("create")}</span>
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
