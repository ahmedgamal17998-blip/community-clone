"use client";

import { useState } from "react";
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

export function NewGroupThreadForm({
  candidates,
}: {
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = candidates.filter((c) => {
    if (!q.trim()) return true;
    const term = q.toLowerCase();
    return (
      (c.name ?? "").toLowerCase().includes(term) ||
      c.handle.toLowerCase().includes(term)
    );
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-4">
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
            You don't share any groups with other members yet.
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
                        <img src={c.image} alt="" className="h-full w-full object-cover" />
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
