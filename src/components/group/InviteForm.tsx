"use client";

import { useState, useTransition } from "react";
import { createInviteAction } from "@/server/invite-actions";

export function InviteForm({ groupId }: { groupId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ link?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function onSubmit(formData: FormData) {
    setResult(null);
    setCopied(false);
    startTransition(async () => {
      const res = await createInviteAction(formData);
      if (!res) return;
      if (res.ok) setResult({ link: res.link });
      else setResult({ error: res.error });
    });
  }

  async function copy() {
    if (!result?.link) return;
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <form action={onSubmit} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="groupId" value={groupId} />
        <div className="flex-1 min-w-[240px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Email (optional)
          </label>
          <input
            type="email"
            name="email"
            placeholder="name@example.com"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Role
          </label>
          <select
            name="role"
            defaultValue="MEMBER"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="MEMBER">Member</option>
            <option value="CONTRIBUTOR">Contributor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create invite"}
        </button>
      </form>

      {result?.error ? (
        <p className="text-sm text-destructive">{result.error}</p>
      ) : null}

      {result?.link ? (
        <div className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">Invite link (valid 14 days):</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={result.link}
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copy}
              className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
