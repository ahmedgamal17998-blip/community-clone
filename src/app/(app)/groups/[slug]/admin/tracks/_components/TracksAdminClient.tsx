"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Edit3, Star, X, Save, Hash, BookOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createTrackAction,
  updateTrackAction,
  deleteTrackAction,
  setTrackResourcesAction,
  updateTrackGroupSettingsAction,
  adminAssignTrackAction,
  adminRemoveTrackAction,
} from "@/server/actions/tracks";
import { cn } from "@/lib/utils";

type Track = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  isDefault: boolean;
  memberCount: number;
  channelIds: string[];
  courseIds: string[];
};

type Channel = { id: string; slug: string; name: string; kind: string };
type Course = { id: string; slug: string; title: string };
type Plan = { id: string; name: string; mappedTrackId: string | null };
type Member = { id: string; name: string | null; email: string | null; image: string | null };

type Props = {
  groupId: string;
  groupSlug: string;
  groupSettings: {
    tracksEnabled: boolean;
    trackPromotionMode: "REPLACE" | "STACK";
    trackBadgeVisible: boolean;
  };
  tracks: Track[];
  channels: Channel[];
  courses: Course[];
  plans: Plan[];
  members: Member[];
  membersByTrack: Record<string, string[]>;
};

export function TracksAdminClient(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const noTracks = props.tracks.length === 0;

  return (
    <div className="space-y-6">
      {/* ─── Group settings ─── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Settings</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tracks let you control which channels each cohort sees. When the
          master toggle is off, the group ignores tracks entirely.
        </p>

        <div className="mt-4 space-y-3">
          <ToggleRow
            label="Enable tracks for this group"
            description="When on, channels/courses linked to a track are visible only to members on that track."
            checked={props.groupSettings.tracksEnabled}
            onChange={(checked) =>
              run(() =>
                updateTrackGroupSettingsAction({
                  groupId: props.groupId,
                  tracksEnabled: checked,
                }),
              )
            }
          />

          {props.groupSettings.tracksEnabled && (
            <>
              <div className="border-t border-border pt-3">
                <Label className="text-sm">Promotion behavior</Label>
                <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                  When you assign a member to a new track, what happens to
                  their existing tracks?
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <RadioRow
                    label="Replace"
                    description="Old tracks are removed."
                    checked={props.groupSettings.trackPromotionMode === "REPLACE"}
                    onClick={() =>
                      run(() =>
                        updateTrackGroupSettingsAction({
                          groupId: props.groupId,
                          trackPromotionMode: "REPLACE",
                        }),
                      )
                    }
                  />
                  <RadioRow
                    label="Stack"
                    description="Tracks accumulate (multi-track)."
                    checked={props.groupSettings.trackPromotionMode === "STACK"}
                    onClick={() =>
                      run(() =>
                        updateTrackGroupSettingsAction({
                          groupId: props.groupId,
                          trackPromotionMode: "STACK",
                        }),
                      )
                    }
                  />
                </div>
              </div>

              <ToggleRow
                label="Show track badge in member profile"
                description="Members see their assigned track name as a colored badge."
                checked={props.groupSettings.trackBadgeVisible}
                onChange={(checked) =>
                  run(() =>
                    updateTrackGroupSettingsAction({
                      groupId: props.groupId,
                      trackBadgeVisible: checked,
                    }),
                  )
                }
              />
            </>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ─── Tracks list ─── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Tracks {props.tracks.length > 0 && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({props.tracks.length})
              </span>
            )}
          </h2>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            disabled={isPending}
          >
            <Plus className="me-1 h-4 w-4" />
            New track
          </Button>
        </div>

        {showCreate && (
          <CreateTrackForm
            groupId={props.groupId}
            onCancel={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              refresh();
            }}
          />
        )}

        {noTracks && !showCreate && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No tracks yet. Create one to start segmenting your members.
          </div>
        )}

        {props.tracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            groupId={props.groupId}
            channels={props.channels}
            courses={props.courses}
            plans={props.plans.filter((p) => p.mappedTrackId === track.id)}
            members={props.members}
            assignedMemberIds={props.membersByTrack[track.id] ?? []}
            isEditing={editing === track.id}
            onEdit={() => setEditing(track.id)}
            onCancelEdit={() => setEditing(null)}
            onChanged={() => {
              setEditing(null);
              refresh();
            }}
          />
        ))}
      </section>
    </div>
  );
}

// ─── Track card ────────────────────────────────────────────────────────────

function TrackCard({
  track,
  groupId,
  channels,
  courses,
  plans,
  members,
  assignedMemberIds,
  isEditing,
  onEdit,
  onCancelEdit,
  onChanged,
}: {
  track: Track;
  groupId: string;
  channels: Channel[];
  courses: Course[];
  plans: Plan[];
  members: Member[];
  assignedMemberIds: string[];
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"channels" | "courses" | "members">("channels");
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(track.name);
  const [description, setDescription] = useState(track.description ?? "");
  const [isDefault, setIsDefault] = useState(track.isDefault);
  const [error, setError] = useState<string | null>(null);

  const [channelIds, setChannelIds] = useState<string[]>(track.channelIds);
  const [courseIds, setCourseIds] = useState<string[]>(track.courseIds);

  // Reset edit-form fields whenever the track enters edit mode, so a
  // typed-but-cancelled value doesn't reappear next time the admin clicks
  // Edit. Channel/course selections are intentionally preserved across
  // refreshes (their dirty-vs-saved comparison is what drives Save).
  useEffect(() => {
    if (isEditing) {
      setName(track.name);
      setDescription(track.description ?? "");
      setIsDefault(track.isDefault);
    }
  }, [isEditing, track.name, track.description, track.isDefault]);

  const channelsDirty =
    channelIds.length !== track.channelIds.length ||
    channelIds.some((id) => !track.channelIds.includes(id));
  const coursesDirty =
    courseIds.length !== track.courseIds.length ||
    courseIds.some((id) => !track.courseIds.includes(id));

  const assignedMemberSet = new Set(assignedMemberIds);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        {isEditing ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Track name"
              className="max-w-xs"
            />
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Default track
            </label>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{
                background: track.color ? `hsl(${track.color})` : "hsl(var(--primary))",
              }}
            />
            <h3 className="truncate font-semibold">{track.name}</h3>
            {track.isDefault && (
              <span className="ms-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <Star className="h-3 w-3" />
                Default
              </span>
            )}
            <span className="ms-2 text-xs text-muted-foreground">
              {track.memberCount} member{track.memberCount === 1 ? "" : "s"}
            </span>
            {plans.length > 0 && (
              <span className="ms-2 truncate text-xs text-muted-foreground">
                · Auto-assigned by:{" "}
                {plans.map((p) => p.name).join(", ")}
              </span>
            )}
          </div>
        )}

        <div className="flex shrink-0 gap-2">
          {isEditing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onCancelEdit}
                disabled={isPending}
              >
                <X className="me-1 h-4 w-4" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  run(() =>
                    updateTrackAction({
                      trackId: track.id,
                      groupId,
                      name,
                      description,
                      isDefault,
                    }),
                  )
                }
                disabled={isPending || !name.trim()}
              >
                <Save className="me-1 h-4 w-4" />
                Save
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Edit3 className="me-1 h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (confirm(`Delete the "${track.name}" track? Members assigned to it will be unassigned.`)) {
                    run(() => deleteTrackAction({ trackId: track.id, groupId }));
                  }
                }}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="border-b border-border px-5 py-3">
          <Label className="text-xs">Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this track for?"
            className="mt-1"
            rows={2}
          />
        </div>
      )}

      {error && (
        <div className="border-b border-border bg-destructive/5 px-5 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border bg-muted/30">
        <div className="flex gap-1 px-3">
          <TabButton active={tab === "channels"} onClick={() => setTab("channels")} icon={Hash}>
            Channels ({channelIds.length})
          </TabButton>
          <TabButton active={tab === "courses"} onClick={() => setTab("courses")} icon={BookOpen}>
            Courses ({courseIds.length})
          </TabButton>
          <TabButton active={tab === "members"} onClick={() => setTab("members")} icon={Users}>
            Members ({assignedMemberIds.length})
          </TabButton>
        </div>
      </div>

      <div className="p-5">
        {tab === "channels" && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Members on this track see only the channels selected here.
              Channels you don't link to any track stay open to all members.
            </p>
            <CheckboxGrid
              items={channels.map((c) => ({
                id: c.id,
                label: `#${c.slug}`,
                sub: c.kind,
              }))}
              selected={channelIds}
              onToggle={(id) =>
                setChannelIds((cur) =>
                  cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
                )
              }
            />
            {channelsDirty && (
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setChannelIds(track.channelIds)}
                  disabled={isPending}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    run(() =>
                      setTrackResourcesAction({
                        groupId,
                        trackId: track.id,
                        channelIds,
                      }),
                    )
                  }
                  disabled={isPending}
                >
                  Save channels
                </Button>
              </div>
            )}
          </>
        )}

        {tab === "courses" && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Courses linked here are visible only to members on this track.
            </p>
            {courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses yet.</p>
            ) : (
              <CheckboxGrid
                items={courses.map((c) => ({ id: c.id, label: c.title, sub: c.slug }))}
                selected={courseIds}
                onToggle={(id) =>
                  setCourseIds((cur) =>
                    cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
                  )
                }
              />
            )}
            {coursesDirty && (
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCourseIds(track.courseIds)}
                  disabled={isPending}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    run(() =>
                      setTrackResourcesAction({
                        groupId,
                        trackId: track.id,
                        courseIds,
                      }),
                    )
                  }
                  disabled={isPending}
                >
                  Save courses
                </Button>
              </div>
            )}
          </>
        )}

        {tab === "members" && (
          <MemberAssignList
            groupId={groupId}
            trackId={track.id}
            members={members}
            assignedSet={assignedMemberSet}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm transition-colors",
        active
          ? "border-b-2 border-primary font-semibold text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}

function RadioRow({
  label,
  description,
  checked,
  onClick,
}: {
  label: string;
  description: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-3 text-start transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-accent/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full border-2",
            checked ? "border-primary bg-primary" : "border-border",
          )}
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function CheckboxGrid({
  items,
  selected,
  onToggle,
}: {
  items: Array<{ id: string; label: string; sub?: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No items.</p>;
  }
  const set = new Set(selected);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((it) => (
        <label
          key={it.id}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
            set.has(it.id)
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-accent/40",
          )}
        >
          <input
            type="checkbox"
            checked={set.has(it.id)}
            onChange={() => onToggle(it.id)}
          />
          <span className="flex-1 truncate">{it.label}</span>
          {it.sub && (
            <span className="text-xs text-muted-foreground">{it.sub}</span>
          )}
        </label>
      ))}
    </div>
  );
}

function CreateTrackForm({
  groupId,
  onCancel,
  onCreated,
}: {
  groupId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">New track</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Beginner, Advanced, VIP Workshop"
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Default track
        </label>
      </div>
      <div className="mt-3">
        <Label className="text-xs">Description (optional)</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1"
        />
      </div>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={isPending || !name.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await createTrackAction({
                  groupId,
                  name: name.trim(),
                  description: description.trim() || undefined,
                  isDefault,
                });
                onCreated();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create");
              }
            });
          }}
        >
          Create track
        </Button>
      </div>
    </div>
  );
}

function MemberAssignList({
  groupId,
  trackId,
  members,
  assignedSet,
  onChanged,
}: {
  groupId: string;
  trackId: string;
  members: Member[];
  assignedSet: Set<string>;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = members.filter((m) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (m.name ?? "").toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q)
    );
  });

  function toggleMember(userId: string, currentlyAssigned: boolean) {
    startTransition(async () => {
      try {
        if (currentlyAssigned) {
          await adminRemoveTrackAction({ groupId, userId, trackId });
        } else {
          await adminAssignTrackAction({ groupId, userId, trackId });
        }
        onChanged();
      } catch {
        /* errors surface elsewhere */
      }
    });
  }

  return (
    <>
      <Input
        placeholder="Filter by name or email"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-3"
      />
      <p className="mb-3 text-xs text-muted-foreground">
        Showing the most recent {members.length} active members. Use the
        member panel to manage older accounts.
      </p>
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No members match "{filter}".
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((m) => {
              const assigned = assignedSet.has(m.id);
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {m.name ?? m.email ?? "Unknown"}
                    </div>
                    {m.name && m.email && (
                      <div className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={assigned ? "outline" : "default"}
                    disabled={isPending}
                    onClick={() => toggleMember(m.id, assigned)}
                  >
                    {assigned ? "Remove" : "Assign"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
