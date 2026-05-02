import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordSignInForm } from "./_components/PasswordSignInForm";

const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const isDemoMode = process.env.DEMO_MODE === "1";

const DEMO_USERS = [
  { name: "Alex", email: "alex@example.com" },
  { name: "Mona", email: "mona@example.com" },
  { name: "Samir", email: "samir@example.com" },
  { name: "Yara", email: "yara@example.com" },
  { name: "Chris", email: "chris@example.com" },
  { name: "Omar", email: "omar@example.com" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const session = await auth();
  if (session?.user) redirect(searchParams.callbackUrl ?? "/home");
  const t = await getTranslations("login");
  const callbackUrl = searchParams.callbackUrl ?? "/home";

  async function emailSignIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await signIn("resend", { email, redirectTo: "/verify" });
  }

  async function googleSignIn() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>

      {isDemoMode ? (
        <div className="mt-6 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-primary">
            Demo — click to sign in instantly
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DEMO_USERS.map((u) => (
              <a
                key={u.email}
                href={`/api/dev/login?email=${u.email}`}
                className="flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {u.name}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <PasswordSignInForm callbackUrl={callbackUrl} />
      )}

      {!isDemoMode && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span className="uppercase tracking-wider">or use a magic link</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <form action={emailSignIn} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="magic-email">{t("emailLabel")}</Label>
              <Input
                id="magic-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" size="lg">
              Email me a sign-in link
            </Button>
          </form>
        </>
      )}

      {!isDemoMode && hasGoogle ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span className="uppercase tracking-wider">{t("orContinueWith")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <form action={googleSignIn}>
            <Button variant="outline" type="submit" className="w-full" size="lg">
              {t("google")}
            </Button>
          </form>
        </>
      ) : null}

      {!isDemoMode && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href={`/register${callbackUrl === "/home" ? "" : `?callbackUrl=${encodeURIComponent(callbackUrl)}`}`}
            className="font-semibold text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">{t("legal")}</p>
    </div>
  );
}
