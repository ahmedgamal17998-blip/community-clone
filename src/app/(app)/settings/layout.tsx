import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

const NAV_ITEMS = [
  { href: "/settings/profile",       label: "Profile" },
  { href: "/settings/notifications",  label: "Notifications" },
  { href: "/settings/availability",   label: "Availability" },
  { href: "/settings/google",         label: "Google Calendar" },
  { href: "/settings/devices",        label: "Devices & Sessions" },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      {/* Mobile nav — horizontal scrollable pills, above content */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 md:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Desktop: sidebar + content side by side */}
      <div className="flex min-h-screen gap-8">
        <aside className="hidden w-48 shrink-0 md:block">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Settings
          </p>
          <nav className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
