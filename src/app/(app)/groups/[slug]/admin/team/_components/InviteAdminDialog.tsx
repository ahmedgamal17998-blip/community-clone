"use client";

import { useState, useTransition } from "react";
import { addAdminAction } from "@/server/actions/admin-team";
import { CAPABILITIES, type Capability } from "@/server/capabilities";
import { Plus, X } from "lucide-react";

const DEFAULT_CAPS: Capability[] = ["MEMBERS_ADD", "POSTS_PIN", "CROSSPOST"];

export function InviteAdminDialog({
  groupId,
  eligibleMembers,
}: {
  groupId: string;
  eligibleMembers: { id: string; name: string | null; handle: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState("");
  const [caps, setCaps] = useState<Capability[]>(DEFAULT_CAPS);

  const submit = () => {
    if (!userId) return;
    startTransition(async () => {
      await addAdminAction({ groupId, userId, capabilities: caps });
      setOpen(false);
      setUserId("");
      setCaps(DEFAULT_CAPS);
    });
  };

  const toggle = (c: Capability) =>
    setCaps((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Add admin
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">Add admin</h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Member
                </label>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a member…</option>
                  {eligibleMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.handle} (@{m.handle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  Capabilities
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CAPABILITIES.map((c) => (
                    <label
                      key={c}
                      className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={caps.includes(c)}
                        onChange={() => toggle(c)}
                      />
                      <span className="font-mono">{c}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={pending || !userId}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Adding…" : "Add admin"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
