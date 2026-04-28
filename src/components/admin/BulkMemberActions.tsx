"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkMemberAction } from "@/server/admin-actions";
import { ROLES } from "@/server/permissions";

type Props = {
  groupId: string;
  groupSlug?: string;
  memberships: Array<{
    id: string;
    role: string;
    state: string;
    userId: string;
    user: { name: string | null; handle: string };
  }>;
};

export function BulkMemberActions({ groupId, groupSlug, memberships }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<"ROLE" | "BAN" | "UNBAN" | "REMOVE">("BAN");
  const [role, setRole] = useState<string>("MEMBER");
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === memberships.length) setSelected(new Set());
    else setSelected(new Set(memberships.map((m) => m.id)));
  }

  function submit() {
    if (selected.size === 0) {
      setMsg("Select at least one member.");
      return;
    }
    const fd = new FormData();
    fd.set("groupId", groupId);
    fd.set("action", action);
    if (action === "ROLE") fd.set("role", role);
    fd.set("membershipIds", JSON.stringify(Array.from(selected)));
    startTransition(async () => {
      const res = await bulkMemberAction(fd);
      if (res?.ok) {
        setMsg(`Processed ${res.processed} member(s).`);
        setSelected(new Set());
        router.refresh();
      } else {
        setMsg(res?.error ?? "Failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <span className="text-sm font-medium">
          {selected.size} selected
        </span>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="ROLE">Change role</option>
          <option value="BAN">Ban</option>
          <option value="UNBAN">Unban</option>
          <option value="REMOVE">Remove</option>
        </select>
        {action === "ROLE" ? (
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={busy || selected.size === 0}
          className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Applying…" : "Apply"}
        </button>
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={selected.size === memberships.length && memberships.length > 0}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="p-2">Member</th>
              <th className="p-2">Role</th>
              <th className="p-2">State</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {memberships.map((m) => (
              <tr key={m.id} className="hover:bg-muted/30">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    disabled={m.role === "OWNER"}
                    aria-label={`Select ${m.user.handle}`}
                  />
                </td>
                <td className="p-2">
                  <div className="font-medium">{m.user.name}</div>
                  <div className="text-xs text-muted-foreground">@{m.user.handle}</div>
                </td>
                <td className="p-2">{m.role}</td>
                <td className="p-2">{m.state}</td>
                <td className="p-2 text-right">
                  {groupSlug && (
                    <a
                      href={`/groups/${groupSlug}/admin/members/${m.userId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Manage
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
