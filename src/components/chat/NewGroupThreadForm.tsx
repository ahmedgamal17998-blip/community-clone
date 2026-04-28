"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGroupThreadAction } from "@/server/chat";

type Candidate = {
  id: string;
  name: string | null;
  handle: string;
  image: string | null;
};

type Group = {
  id: string;
  name: string;
  slug: string;
};

type Props = {
  groups: Group[];
  candidatesByGroup: Record<string, Candidate[]>;
};

export function NewGroupThreadForm({ groups, candidatesByGroup }: Props) {
  const router = useRouter();
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Candidates for the currently-selected group only.
  const candidates = useMemo(
    () => (groupId ? candidatesByGroup[groupId] ?? [] : []),
    [groupId, candidatesByGroup],
  );

  const filtered = useMemo(() => {
    if (!q.trim()) return candidates;
    const term = q.toLowerCase();
    return candidates.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(term) ||
        c.handle.toLowerCase().includes(term),
    );
  }, [candidates, q]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Reset selection when the group changes (members differ between groups).
  function onGroupChange(next: string) {
    setGroupId(next);
    setSelected(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!groupId) {
      setError("Pick a group");
      return;
    }
    if (!title.trim()) {
      setError("Title required");
      return;
    }
    if (selected.size < 2) {
      setError("Pick at least 2 members");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("groupId", groupId);
      fd.set("title", title.trim());
      for (const id of selected) fd.append("participantIds", id);
      const res = await createGroupThreadAction(fd);
      if (!res?.ok) {
        setError(res?.error ?? "Failed to create thread");
        return;
      }
      router.push(`/chat/${res.threadId}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          You need to be in a group before creating a group chat.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      {/* Group picker */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="groupId">
          Group
        </label>
        <select
          id="groupId"
          value={groupId}
          onChange={(e) => onGroupChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          The chat will be tied to this group and visible in its My Subscription page.
        </p>
      </div>

      {/* Title */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="title">
          Title
        </label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekend study group"
          maxLength={80}
        />
      </div>

      {/* Members */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Members ({selected.size})
        </label>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search members…"
        />
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No other active members in this group yet.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border">
            {filtered.map((c) => {
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold">
                      {c.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (c.name ?? c.handle).slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{c.name ?? c.handle}</span>{" "}
                      <span className="text-muted-foreground">@{c.handle}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create group"}
        </Button>
      </div>
    </form>
  );
}
