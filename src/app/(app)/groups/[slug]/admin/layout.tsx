import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

const NAV = [
  { href: "", label: "Overview" },
  { href: "/members", label: "Members" },
  { href: "/requests", label: "Requests" },
  { href: "/channels", label: "Channels" },
  { href: "/team", label: "Team" },
  { href: "/plans", label: "Plans" },
  { href: "/announcements", label: "Announcements" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/branding", label: "Branding" },
  { href: "/settings", label: "Settings" },
];

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true, name: true, deletedAt: true },
  });
  if (!group || group.deletedAt) notFound();

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    notFound();
  }

  const base = `/groups/${group.slug}/admin`;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
      <aside className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Admin
        </h2>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={`${base}${item.href}`}
              className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
