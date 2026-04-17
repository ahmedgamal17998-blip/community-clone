import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  const session = await auth();
  const t = await getTranslations("nav");

  return (
    <section className="mx-auto max-w-2xl py-12 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Community Clone
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Skool / ClientClub-style community platform — work in progress.
        <br />
        Milestone 1: auth, profile, dark mode, and bilingual (EN / AR) shell.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        {session?.user ? (
          <Button asChild size="lg">
            <Link href="/home">Open app →</Link>
          </Button>
        ) : (
          <>
            <Button asChild size="lg">
              <Link href="/login">{t("signIn")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Create account</Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
