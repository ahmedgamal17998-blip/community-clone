import Link from "next/link";
import { ResetPasswordForm } from "./_components/ResetPasswordForm";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;

  if (!token) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Invalid link</h1>
        <p className="text-sm text-muted-foreground">
          This reset link is missing a token.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block text-sm text-primary hover:underline underline-offset-4"
        >
          Request a new reset link →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Set new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose a new password for your account.
      </p>
      <div className="mt-6">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
