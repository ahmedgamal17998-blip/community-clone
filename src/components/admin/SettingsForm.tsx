"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateGroupSettingsAction,
  softDeleteGroupAction,
} from "@/server/admin-actions";

type Props = {
  groupId: string;
  isOwner: boolean;
  initial: {
    name: string;
    slug: string;
    description: string | null;
    visibility: string;
    active: boolean;
  };
};

export function SettingsForm({ groupId, isOwner, initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description ?? "");
  const [visibility, setVisibility] = useState(initial.visibility);
  const [active, setActive] = useState(initial.active);
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    if (slug !== initial.slug) {
      const ok = window.confirm(
        "Changing the slug will break all existing URLs that point to this group. Continue?",
      );
      if (!ok) return;
    }
    const fd = new FormData();
    fd.set("groupId", groupId);
    fd.set("name", name);
    fd.set("slug", slug);
    fd.set("description", description);
    fd.set("visibility", visibility);
    fd.set("active", active ? "1" : "0");
    startTransition(async () => {
      const res = await updateGroupSettingsAction(fd);
      if (res?.ok) {
        setMsg("Saved.");
        if (res.slug && res.slug !== initial.slug) {
          window.location.href = `/groups/${res.slug}/admin/settings`;
        } else {
          router.refresh();
        }
      } else {
        setMsg(res?.error ?? "Failed");
      }
    });
  }

  function softDelete() {
    const ok = window.confirm(
      "Soft-delete this group? It will be hidden for 30 days, then permanently deleted. Owners can restore during that window.",
    );
    if (!ok) return;
    const fd = new FormData();
    fd.set("groupId", groupId);
    startTransition(async () => {
      const res = await softDeleteGroupAction(fd);
      if (res?.ok) {
        window.location.href = "/owner/archive";
      } else {
        setMsg(res?.error ?? "Failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-sm"
          />
          {slug !== initial.slug ? (
            <span className="mt-1 block text-xs text-yellow-600">
              Changing the slug breaks existing URLs.
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Visibility</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="PUBLIC">PUBLIC</option>
            <option value="PRIVATE">PRIVATE</option>
            <option value="HIDDEN">HIDDEN</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
          {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
        </div>
      </div>

      {isOwner ? (
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="text-sm font-semibold text-destructive">Danger zone</div>
          <p className="text-xs text-muted-foreground">
            Soft-delete hides the group for 30 days. After that it&apos;s purged.
            You can restore during the grace period from the Owner archive.
          </p>
          <button
            type="button"
            onClick={softDelete}
            disabled={busy}
            className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            Soft-delete group
          </button>
        </div>
      ) : null}
    </div>
  );
}
