import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";

export default async function ProfilePage({ params }: { params: { handle: string } }) {
  const t = await getTranslations("profile");
  const handle = params.handle.replace(/^@/, "");

  const [session, user] = await Promise.all([
    auth(),
    db.user.findUnique({
      where: { handle },
      select: {
        id: true,
        name: true,
        handle: true,
        image: true,
        bio: true,
        email: true,
        emailPublic: true,
        createdAt: true,
        presence: { select: { lastSeenAt: true, status: true } },
      },
    }),
  ]);

  if (!user) notFound();
  const isMe = session?.user?.id === user.id;

  return (
    <section className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-20 w-20">
            {user.image ? <AvatarImage src={user.image} alt={user.name ?? ""} /> : null}
            <AvatarFallback className="text-xl">{initialsFrom(user.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
            <p className="text-sm text-muted-foreground">@{user.handle}</p>
            {user.bio ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground dir-auto">{user.bio}</p>
            ) : null}

            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {user.presence?.lastSeenAt ? (
                <div>
                  <dt className="sr-only">Active</dt>
                  <dd>{t("activeTime", { time: timeAgo(user.presence.lastSeenAt) })}</dd>
                </div>
              ) : null}
              <div>
                <dt className="sr-only">Joined</dt>
                <dd>
                  {t("joined", {
                    date: new Date(user.createdAt).toLocaleDateString(),
                  })}
                </dd>
              </div>
              {(user.emailPublic || isMe) && user.email ? (
                <div className="col-span-2">
                  <dt className="sr-only">Email</dt>
                  <dd className="break-all">{user.email}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          {isMe ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/profile">{t("editTitle")}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
