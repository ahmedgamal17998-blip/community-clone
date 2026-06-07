"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithPasswordAction } from "@/server/actions/password-auth";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Please enter a valid email and password.",
  INVALID_CREDENTIALS: "Email or password is incorrect.",
};

export function PasswordSignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        formData.set("callbackUrl", callbackUrl);
        setError(null);
        startTransition(async () => {
          const result = await signInWithPasswordAction(formData);
          // On success the action redirects; the awaited promise rejects
          // with NEXT_REDIRECT which we don't surface as an error.
          if (result && "error" in result && result.error) {
            setError(ERROR_MESSAGES[result.error] ?? "Sign-in failed.");
          }
        });
      }}
      className="mt-6 space-y-3"
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          minLength={1}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
