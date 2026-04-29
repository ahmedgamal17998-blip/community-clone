"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { addAdminAction } from "@/server/actions/admin-team";
import { CAPABILITIES, type Capability } from "@/server/capabilities";
import { Plus, X, ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_CAPS: Capability[] = ["MEMBERS_ADD", "POSTS_PIN", "CROSSPOST"];

type Member = { id: string; name: string | null; handle: string };

// Searchable member picker — type to filter by name or handle.
function MemberCombobox({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = members.find((m) => m.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(q) ||
        m.handle.toLowerCase().includes(q),
    );
  }, [members, query]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/40"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? `${selected.name ?? selected.handle} (@${selected.handle})` : "Select a member…"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          {/* Backdrop click closes the dropdown */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            {/* Search box */}
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search by name or @handle"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-md border border-input bg-background pl-7 pr-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Results */}
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                  No members match
                </li>
              ) : (
                filtered.map((m) => {
                  const active = m.id === value;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(m.id);
                          setOpen(false);
                          setQuery("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                          active && "bg-primary/10",
                        )}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {active ? (
                            <Check className="h-3.5 w-3.5 text-primary" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">
                            {m.name ?? m.handle}
                          </span>
                          <span className="ms-1 text-xs text-muted-foreground">
                            @{m.handle}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl max-h-[90vh] overflow-y-auto"
            style={{ opacity: 1 }}
            role="dialog"
            aria-modal="true"
          >
            {/* Group-primary accent strip — consistent with LoginPopup pattern */}
            <div
              className="h-1.5 w-full"
              style={{
                background:
                  "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
              }}
            />
            <div className="p-6">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold">Add admin</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Member
                </label>
                <MemberCombobox
                  members={eligibleMembers}
                  value={userId}
                  onChange={setUserId}
                />
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
        </div>
      )}
    </>
  );
}
