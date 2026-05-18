"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Users, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTenantAction } from "@/server/tenant";

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function AdminSetupClient({
  tenant,
}: {
  tenant: { id: string; name: string; slug: string } | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Workspace fields (only shown when no tenant yet)
  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");

  // Group fields
  const [grpName, setGrpName] = useState("");
  const [grpSlug, setGrpSlug] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE" | "HIDDEN">("PUBLIC");

  const needsWorkspace = !tenant;

  function handleWsName(v: string) {
    setWsName(v);
    if (!wsSlug || wsSlug === slugify(wsName)) setWsSlug(slugify(v));
  }

  function handleGrpName(v: string) {
    setGrpName(v);
    if (!grpSlug || grpSlug === slugify(grpName)) setGrpSlug(slugify(v));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createTenantAction({
        tenantName: needsWorkspace ? wsName : (tenant?.name ?? ""),
        tenantSlug: needsWorkspace ? wsSlug : (tenant?.slug ?? ""),
        groupName: grpName,
        groupSlug: grpSlug,
        visibility,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push("/admin");
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {needsWorkspace ? "Set up your workspace" : "Create your first group"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {needsWorkspace
            ? "Configure your workspace name and create your first group to get started."
            : "You need at least one group to start using your workspace."}
        </p>
      </div>

      <div className="space-y-6">
        {/* Workspace section */}
        {needsWorkspace && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Workspace</h2>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Workspace name</label>
              <input
                value={wsName}
                onChange={(e) => handleWsName(e.target.value)}
                placeholder="Acme Academy"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Workspace URL</label>
              <div className="flex items-center rounded-xl border border-border bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground shrink-0">nadi.app/ws/</span>
                <input
                  value={wsSlug}
                  onChange={(e) => setWsSlug(e.target.value)}
                  placeholder="acme-academy"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Group section */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">First group</h2>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Group name</label>
            <input
              value={grpName}
              onChange={(e) => handleGrpName(e.target.value)}
              placeholder="Marketing Mastery"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Group URL</label>
            <div className="flex items-center rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <span className="text-muted-foreground shrink-0">nadi.app/groups/</span>
              <input
                value={grpSlug}
                onChange={(e) => setGrpSlug(e.target.value)}
                placeholder="marketing-mastery"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "PUBLIC" | "PRIVATE" | "HIDDEN")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="PUBLIC">Public — anyone can find and join</option>
              <option value="PRIVATE">Private — visible but requires approval</option>
              <option value="HIDDEN">Hidden — invite only</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </p>
        )}

        <Button onClick={handleSubmit} disabled={isPending} className="w-full gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {needsWorkspace ? "Create workspace & group" : "Create group"}
        </Button>
      </div>
    </div>
  );
}
