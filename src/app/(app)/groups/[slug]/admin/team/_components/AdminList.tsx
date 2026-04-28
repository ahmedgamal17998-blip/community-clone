"use client";

import { useTransition, useState } from "react";
import {
  removeAdminAction,
  updateCapabilitiesAction,
} from "@/server/actions/admin-team";
import { CAPABILITIES, type Capability } from "@/server/capabilities";

type AdminRow = {
  userId: string;
  role: string;
  user: { id: string; name: string | null; handle: string; image: string | null };
  capabilities: Capability[];
};

export function AdminList({
  groupId,
  admins,
}: {
  groupId: string;
  admins: AdminRow[];
}) {
  return (
    <div className="space-y-3">
      {admins.map((a) => (
        <AdminRow key={a.userId} groupId={groupId} admin={a} />
      ))}
    </div>
  );
}

function AdminRow({ groupId, admin }: { groupId: string; admin: AdminRow }) {
  const [pending, startTransition] = useTransition();
  const [caps, setCaps] = useState<Capability[]>(admin.capabilities);
  const isOwner = admin.role === "OWNER";

  const toggle = (c: Capability) => {
    if (isOwner) return;
    setCaps((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const save = () => {
    if (isOwner) return;
    startTransition(async () => {
      await updateCapabilitiesAction({
        groupId,
        userId: admin.userId,
        capabilities: caps,
      });
    });
  };

  const remove = () => {
    if (isOwner) return;
    if (!confirm(`Remove ${admin.user.name ?? admin.user.handle} as admin?`)) return;
    startTransition(async () => {
      await removeAdminAction({ groupId, userId: admin.userId });
    });
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {admin.user.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={admin.user.image}
              alt=""
              className="h-9 w-9 rounded-full object-cover"
            />
          )}
          <div>
            <div className="font-medium">
              {admin.user.name ?? admin.user.handle}
            </div>
            <div className="text-xs text-muted-foreground">
              @{admin.user.handle} •{" "}
              <span
                className={`rounded px-1.5 py-0.5 ${
                  isOwner
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {admin.role}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOwner && (
            <>
              <button
                onClick={save}
                disabled={pending}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={remove}
                disabled={pending}
                className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        {CAPABILITIES.map((c) => (
          <label
            key={c}
            className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${
              isOwner ? "opacity-60" : "cursor-pointer hover:bg-muted/50"
            }`}
          >
            <input
              type="checkbox"
              checked={caps.includes(c)}
              onChange={() => toggle(c)}
              disabled={isOwner}
            />
            <span className="font-mono">{c}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
