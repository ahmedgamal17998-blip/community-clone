"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/server/actions/reset-password";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Password must be at least 8 characters.",
  INVALID_TOKEN: "This reset link is invalid. Please request a new one.",
  EXPIRED: "This reset link has expired. Please request a new one.",
  NOT_FOUND: "No account found for this link. Please request a new one.",
};

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="space-y-4 text-center py-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 text-2xl">
          ✓
        </div>
        <h2 className="text-lg font-semibold">Password updated!</h2>
        <p className="text-sm text-muted-foreground">
          Your password has been changed. You can now sign in with your new password.
        </p>
        <Button className="w-full" size="lg" onClick={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        formData.set("token", token);
        setError(null);
        startTransition(async () => {
          const result = await resetPasswordAction(formData);
          if ("error" in result) {
            setError(ERROR_MESSAGES[result.error] ?? "Something went wrong.");
          } else {
            setDone(true);
          }
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          placeholder="At least 8 characters"
        />
      </div>

      {error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          {(error.includes("invalid") || error.includes("expired")) && (
            <Link
              href="/forgot-password"
              className="text-sm text-primary hover:underline underline-offset-4"
            >
              Request a new reset link →
            </Link>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}
