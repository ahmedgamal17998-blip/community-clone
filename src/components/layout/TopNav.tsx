/**
 * Global top navigation.
 *
 * Mobile (< sm):
 *   • Home · GroupSwitcher (current group name) · ms-auto · Bell · Chat · Avatar
 *   • Search input + Bookmark + Apps icons hidden — they live in the
 *     UserMenu submenu instead, to keep the bar uncluttered on phones.
 *
 * Desktop (sm+):
 *   • Home · GroupSwitcher · Search · Theme · Locale · Bell · Saved · Apps · Chat · Avatar
 *
 * Active-group detection: the middleware forwards the current pathname
 * via the `x-pathname` request header. We read it here, extract the
 * `/groups/<slug>` segment if present, and pass it to GroupSwitcher so
 * the trigger shows the group's name + avatar instead of "All groups".
 */
import { headers } from "next/headers";
import Link from "next/link";
import { Bookmark, Grid3x3, Home, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LocaleToggle } from "@/components/layout/LocaleToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { GroupSwitcher } from "@/components/group/GroupSwitcher";
import { NotificationBell } from "@/components/nav/NotificationBell";
import { ChatButton } from "@/components/nav/ChatButton";

function activeGroupSlugFromHeaders(): string | undefined {
  const path = headers().get("x-pathname") ?? "";
  const match = path.match(/^\/groups\/([^/]+)/);
  return match?.[1];
}

export async function TopNav() {
  const session = await auth();
  const t = await getTranslations("nav");
  const activeSlug = activeGroupSlugFromHeaders();

  // Resolve the current group context for UserMenu (Admin / Leave entries).
  let currentGroup:
    | { slug: string; name: string; canManage: boolean; canLeave: boolean }
    | null = null;
  if (session?.user && activeSlug) {
    const g = await db.group.findUnique({
      where: { slug: activeSlug },
      select: {
        slug: true,
        name: true,
        memberships: {
          where: { userId: session.user.id },
          select: { role: true, state: true },
        },
      },
    });
    const m = g?.memberships?.[0];
    if (g && m && m.state === "ACTIVE") {
      currentGroup = {
        slug: g.slug,
        name: g.name,
        canManage: hasMinRole(m.role as Role, "ADMIN"),
        canLeave: m.role !== "OWNER",
      };
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-1.5 px-2 sm:gap-3 sm:px-4">
        <Link
          href="/home"
          aria-label={t("home")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-muted"
        >
          <Home className="h-5 w-5" />
        </Link>

        {session?.user ? (
          <GroupSwitcher activeSlug={activeSlug} />
        ) : null}

        {/* Search input — desktop only. */}
        <div className="relative mx-1 hidden flex-1 max-w-md sm:block">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("search")} className="ps-9 rounded-full bg-muted border-transparent" />
        </div>

        <div className="ms-auto flex shrink-0 items-center gap-0 sm:gap-1">
          {/* Theme + locale toggles — desktop only (UserMenu has them on mobile). */}
          <div className="hidden sm:flex items-center gap-0">
            <ThemeToggle />
            <LocaleToggle />
          </div>
          {session?.user ? (
            <>
              <span data-tour="nav-notifications">
                <NotificationBell viewerId={session.user.id} />
              </span>
              {/* Saved — desktop only */}
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label="Saved"
                title="Saved"
                className="hidden sm:inline-flex h-9 w-9"
                data-tour="nav-saved"
              >
                <Link href="/saved">
                  <Bookmark className="h-5 w-5" />
                </Link>
              </Button>
              {/* Apps grid — desktop only, low priority on mobile. */}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Apps"
                title="Apps"
                className="hidden sm:inline-flex"
              >
                <Grid3x3 className="h-5 w-5" />
              </Button>
              <ChatButton label={t("chat")} />
              <span data-tour="nav-profile">
                <UserMenu
                  name={session.user.name ?? null}
                  email={session.user.email ?? null}
                  image={session.user.image ?? null}
                  handle={session.user.handle}
                  currentGroup={currentGroup}
                />
              </span>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">{t("signIn")}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
