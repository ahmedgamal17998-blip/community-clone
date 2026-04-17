/**
 * Global top navigation — matches audit §3 chrome:
 *   Home · (group switcher placeholder) · Search · Theme · App-switcher · Bell · Avatar · Chat
 * Most right-side affordances are stubbed in M1 — they light up in later milestones.
 */
import Link from "next/link";
import { Grid3x3, Home, MessageCircle, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LocaleToggle } from "@/components/layout/LocaleToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { GroupSwitcher } from "@/components/group/GroupSwitcher";
import { NotificationBell } from "@/components/nav/NotificationBell";

type TopNavProps = { activeGroupSlug?: string };

export async function TopNav({ activeGroupSlug }: TopNavProps = {}) {
  const session = await auth();
  const t = await getTranslations("nav");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-3 sm:px-4">
        <Link
          href="/home"
          aria-label={t("home")}
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
        >
          <Home className="h-5 w-5" />
        </Link>

        {session?.user ? <GroupSwitcher activeSlug={activeGroupSlug} /> : null}

        <div className="relative mx-1 hidden flex-1 max-w-md sm:block">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("search")} className="ps-9 rounded-full bg-muted border-transparent" />
        </div>

        <div className="ms-auto flex items-center gap-1">
          <ThemeToggle />
          <LocaleToggle />
          {session?.user ? (
            <>
              <NotificationBell />
              <Button variant="ghost" size="icon" aria-label="Apps" title="Apps">
                <Grid3x3 className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="sm" className="gap-2" aria-label={t("chat")}>
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">{t("chat")}</span>
              </Button>
              <UserMenu
                name={session.user.name ?? null}
                email={session.user.email ?? null}
                image={session.user.image ?? null}
                handle={session.user.handle}
              />
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
