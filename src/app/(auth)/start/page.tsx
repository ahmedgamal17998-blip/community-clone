import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { RegisterForm } from "../register/_components/RegisterForm";
import { Check } from "lucide-react";

const hasGoogle = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export default async function StartPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const session = await auth();
  if (session?.user) redirect("/admin/setup");

  const callbackUrl = "/admin/setup";

  async function googleSignIn() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your community</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up your own branded community platform in minutes.
        </p>
      </div>

      <ul className="mb-6 space-y-2">
        {["Unlimited members", "Courses & events", "Custom branding", "Monetization tools"].map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-primary shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {hasGoogle ? (
        <div>
          <form action={googleSignIn}>
            <Button variant="outline" type="submit" className="w-full" size="lg">
              Continue with Google
            </Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span className="uppercase tracking-wider">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <RegisterForm callbackUrl={callbackUrl} accountType="OWNER" />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login?callbackUrl=/admin/setup" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Just want to join a community?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Sign up as member
        </Link>
      </p>
    </div>
  );
}
