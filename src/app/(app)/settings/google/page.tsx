import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";

type Props = { searchParams?: { connected?: string; disconnected?: string; error?: string } };

export default async function SettingsGooglePage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const acct = await db.googleAccount.findUnique({
    where: { userId: session.user.id },
    select: {
      email: true,
      scope: true,
      connectedAt: true,
      accessTokenExpiresAt: true,
    },
  });

  const err = searchParams?.error;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Google Calendar + Meet</h1>
        <p className="text-sm text-muted-foreground">
          Connect Google so invitees can book time with you — we create a
          Calendar event with a Meet link automatically.
        </p>
      </header>

      {err ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Connection failed ({err}). Please try again.
        </div>
      ) : null}
      {searchParams?.connected === "1" ? (
        <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          Google connected.
        </div>
      ) : null}
      {searchParams?.disconnected === "1" ? (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          Google disconnected.
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-6">
        {acct ? (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Connected account
              </div>
              <div className="font-medium">{acct.email}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Since {new Date(acct.connectedAt).toLocaleDateString()}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Scopes granted
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {(acct.scope || "")
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((s) => (
                    <li key={s} className="break-all">
                      {s}
                    </li>
                  ))}
              </ul>
            </div>

            <form action="/api/google/disconnect" method="POST">
              <Button type="submit" variant="outline">
                Disconnect Google
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You haven&apos;t connected a Google account yet.
            </p>
            <Button asChild>
              <a href="/api/google/connect">Connect Google</a>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
