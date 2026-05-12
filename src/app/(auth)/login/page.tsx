import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/server/auth";
import { Button } from "@/components/ui/button";
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
      ) : null}

      {/* Google OAuth — top action when configured. The Google provider in
          auth.ts handles both first-time sign-up and returning sign-in via
          PrismaAdapter.createUser, so this single button covers both cases.
          Hidden if AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET aren't set. */}
      {!isDemoMode && hasGoogle ? (
        <div className="mt-6">
          <form action={googleSignIn}>
            <Button variant="outline" type="submit" className="w-full" size="lg">
              <GoogleIcon />
              <span className="ms-2">{t("google")}</span>
            </Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span className="uppercase tracking-wider">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      {!isDemoMode && <PasswordSignInForm callbackUrl={callbackUrl} />}

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

/**
 * Multi-colored Google "G" mark. Inlined as SVG (no extra dep, no flash of
 * unstyled icon on first paint). Colors match Google's brand guidelines for
 * the "Sign in with Google" button.
 */
function GoogleIcon() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 shrink-0"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.93 11.93 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
