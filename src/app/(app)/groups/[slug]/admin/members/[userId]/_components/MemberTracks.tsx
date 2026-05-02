"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Star } from "lucide-react";
import {
  adminAssignTrackAction,
  adminRemoveTrackAction,
} from "@/server/actions/tracks";
import { Button } from "@/components/ui/button";

type Track = {
  id: string;
  name: string;
  color: string | null;
  isDefault: boolean;
};

type MemberTrack = {
  trackId: string;
  source: string;
  assignedAt: string;
};

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  PLAN: "Plan",
  DEFAULT: "Default",
};

export function MemberTracks({
  groupId,
  userId,
  tracks,
  memberTracks,
}: {
  groupId: string;
  userId: string;
  tracks: Track[];
  memberTracks: MemberTrack[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const assignedIds = new Set(memberTracks.map((m) => m.trackId));
  const trackById = Object.fromEntries(tracks.map((t) => [t.id, t]));
  const availableTracks = tracks.filter((t) => !assignedIds.has(t.id));

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        setPickerOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (tracks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tracks defined yet. Create them on the{" "}
        <a className="text-primary hover:underline" href="../../tracks">
          Tracks page
        </a>
        .
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Tracks gate which channels and courses this member can see. Manual
        assignments survive subscription renewal and changes.
      </p>

      {memberTracks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Not on any track. Member only sees public channels.
        </div>
      ) : (
        <ul className="space-y-2">
          {memberTracks.map((mt) => {
            const t = trackById[mt.trackId];
            if (!t) return null;
            return (
              <li
                key={mt.trackId}
                className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
              >
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{
                    background: t.color
                      ? `hsl(${t.color})`
                      : "hsl(var(--primary))",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {t.name}
                    {t.isDefault && (
                      <Star className="h-3 w-3 text-primary" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {SOURCE_LABEL[mt.source] ?? mt.source} · assigned{" "}
                    {new Date(mt.assignedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run(() =>
                      adminRemoveTrackAction({
                        groupId,
                        userId,
                        trackId: mt.trackId,
                      }),
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {availableTracks.length > 0 && (
        <>
          {pickerOpen ? (
            <div className="flex flex-wrap gap-2">
              {availableTracks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    run(() =>
                      adminAssignTrackAction({
                        groupId,
                        userId,
                        trackId: t.id,
                      }),
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background: t.color
                        ? `hsl(${t.color})`
                        : "hsl(var(--primary))",
                    }}
                  />
                  {t.name}
                  {t.isDefault && <Star className="h-3 w-3" />}
                </button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPickerOpen(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="me-1 h-4 w-4" />
              Add track
            </Button>
          )}
        </>
      )}
    </div>
  );
}
