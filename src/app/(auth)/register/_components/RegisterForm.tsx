"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerWithPasswordAction } from "@/server/actions/password-auth";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Please check your name, email, and password (8+ characters).",
  EMAIL_TAKEN: "An account with that email already exists. Try signing in.",
};

export function RegisterForm({ callbackUrl, accountType }: { callbackUrl: string; accountType?: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        formData.set("callbackUrl", callbackUrl);
        formData.set("accountType", accountType ?? "MEMBER");
        setError(null);
        startTransition(async () => {
          const result = await registerWithPasswordAction(formData);
          if (result && "error" in result && result.error) {
            setError(ERROR_MESSAGES[result.error] ?? "Registration failed.");
          }
        });
      }}
      className="mt-6 space-y-3"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Your name"
          minLength={1}
          maxLength={80}
        />
      </div>
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
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
