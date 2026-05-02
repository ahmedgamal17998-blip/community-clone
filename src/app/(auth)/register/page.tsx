import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { RegisterForm } from "./_components/RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const session = await auth();
  if (session?.user) redirect(searchParams.callbackUrl ?? "/home");
  const callbackUrl = searchParams.callbackUrl ?? "/home";

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign up with your email and a password.
      </p>

      <RegisterForm callbackUrl={callbackUrl} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login${callbackUrl === "/home" ? "" : `?callbackUrl=${encodeURIComponent(callbackUrl)}`}`}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
