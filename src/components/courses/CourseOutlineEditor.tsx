"use client";

/**
 * Course Outline Editor — Phase 1.
 *
 * Renders the modules → lessons tree with:
 *   • Status pill per row: Published / Draft / Drip / Locked
 *   • Per-module Add Content dropdown (Lesson / Quiz / Assignment)
 *   • Inline rename for modules
 *   • Module-level drip-days input when releaseMode = DRIP
 *   • Add module button at the top
 *   • Lesson rows link out to the existing lesson editor
 *
 * Drag-drop reordering is not in Phase 1 (kept simple). Position is set on
 * create; an explicit "Move up/down" affordance can be added later.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Video,
  FileText,
  HelpCircle,
  ClipboardList,
  Pencil,
  Trash2,
  Check,
  Lock as LockIcon,
  Hourglass,
  CircleDashed,
  Send,
} from "lucide-react";
import {
  createModuleAction,
  updateModuleAction,
  deleteModuleAction,
  createLessonInModuleAction,
  updateLessonMetaAction,
} from "@/server/module-actions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type LessonNode = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  releaseMode: string;
  dripDays: number | null;
  published: boolean;
  position: number;
};

type ModuleNode = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  releaseMode: string;
  dripDays: number | null;
  published: boolean;
  lessons: LessonNode[];
};

type Props = {
  courseId: string;
  groupSlug: string;
  courseSlug: string;
  initialOutline: ModuleNode[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const RELEASE_OPTIONS = [
  { value: "PUBLISHED", label: "Published", icon: Check, color: "text-green-700 dark:text-green-400" },
  { value: "DRIP", label: "Drip", icon: Hourglass, color: "text-amber-700 dark:text-amber-400" },
  { value: "LOCKED", label: "Locked", icon: LockIcon, color: "text-muted-foreground" },
] as const;

function StatusPill({
  published,
  releaseMode,
  dripDays,
  small,
}: {
  published: boolean;
  releaseMode: string;
  dripDays: number | null;
  small?: boolean;
}) {
  if (!published) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-muted px-2 text-foreground/70",
          small ? "py-0.5 text-[10px]" : "py-1 text-xs",
        )}
      >
        <CircleDashed className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Draft
      </span>
    );
  }
  if (releaseMode === "DRIP") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 text-amber-700 dark:text-amber-400",
          small ? "py-0.5 text-[10px]" : "py-1 text-xs",
        )}
      >
        <Hourglass className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Drip {dripDays != null ? `· ${dripDays}d` : ""}
      </span>
    );
  }
  if (releaseMode === "LOCKED") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-muted px-2 text-muted-foreground",
          small ? "py-0.5 text-[10px]" : "py-1 text-xs",
        )}
      >
        <LockIcon className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Locked
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 text-green-700 dark:text-green-400",
        small ? "py-0.5 text-[10px]" : "py-1 text-xs",
      )}
    >
      <Check className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Published
    </span>
  );
}

function lessonIcon(kind: string) {
  if (kind === "QUIZ") return HelpCircle;
  if (kind === "ASSIGNMENT") return ClipboardList;
  if (kind === "TEXT") return FileText;
  return Video;
}

// ═════════════════════════════════════════════════════════════════════════════

export function CourseOutlineEditor({
  courseId,
  groupSlug,
  courseSlug,
  initialOutline,
}: Props) {
  const [outline, setOutline] = useState<ModuleNode[]>(initialOutline);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialOutline.map((m) => m.id)),
  );

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Module handlers ──────────────────────────────────────────────────────
  const addModule = () => {
    const title = prompt("Module title", "New module");
    if (!title || !title.trim()) return;
    startTransition(async () => {
      const res = await createModuleAction({ courseId, title: title.trim() });
      if (res?.ok && res.moduleId) {
        const optimistic: ModuleNode = {
          id: res.moduleId,
          title: title.trim(),
          description: null,
          position: outline.length,
          releaseMode: "PUBLISHED",
          dripDays: null,
          published: true,
          lessons: [],
        };
        setOutline((prev) => [...prev, optimistic]);
        setExpanded((prev) => new Set(prev).add(res.moduleId!));
      } else if (res && !res.ok) {
        alert(res.error ?? "Failed to create module");
      }
    });
  };

  const renameModule = (m: ModuleNode) => {
    const title = prompt("Rename module", m.title);
    if (!title || !title.trim() || title === m.title) return;
    startTransition(async () => {
      const res = await updateModuleAction({ moduleId: m.id, title: title.trim() });
      if (res?.ok) {
        setOutline((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, title: title.trim() } : x)),
        );
      }
    });
  };

  const deleteModule = (m: ModuleNode) => {
    if (!confirm(`Delete module "${m.title}"? Lessons inside become orphans.`)) return;
    startTransition(async () => {
      const res = await deleteModuleAction({ moduleId: m.id });
      if (res?.ok) {
        setOutline((prev) => prev.filter((x) => x.id !== m.id));
      }
    });
  };

  const updateModuleField = (
    m: ModuleNode,
    patch: {
      releaseMode?: "PUBLISHED" | "DRIP" | "LOCKED";
      dripDays?: number | null;
      published?: boolean;
    },
  ) => {
    // Optimistic
    setOutline((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, ...patch } : x)),
    );
    startTransition(async () => {
      const res = await updateModuleAction({
        moduleId: m.id,
        ...patch,
      });
      if (!res?.ok) {
        // Rollback
        setOutline((prev) =>
          prev.map((x) => (x.id === m.id ? m : x)),
        );
      }
    });
  };

  // ── Lesson handlers ──────────────────────────────────────────────────────
  const addLesson = (
    m: ModuleNode,
    kind: "VIDEO" | "TEXT" | "QUIZ" | "ASSIGNMENT",
  ) => {
    const placeholder =
      kind === "QUIZ"
        ? "New quiz"
        : kind === "ASSIGNMENT"
          ? "New assignment"
          : kind === "TEXT"
            ? "New text lesson"
            : "New lesson";
    const title = prompt(`${placeholder} title`, placeholder);
    if (!title || !title.trim()) return;
    startTransition(async () => {
      const res = await createLessonInModuleAction({
        moduleId: m.id,
        title: title.trim(),
        kind,
      });
      if (res?.ok && res.lessonId && res.slug) {
        const optimistic: LessonNode = {
          id: res.lessonId,
          slug: res.slug,
          title: title.trim(),
          kind,
          releaseMode: "PUBLISHED",
          dripDays: null,
          published: false,
          position: m.lessons.length,
        };
        setOutline((prev) =>
          prev.map((x) =>
            x.id === m.id ? { ...x, lessons: [...x.lessons, optimistic] } : x,
          ),
        );
      } else if (res && !res.ok) {
        alert(res.error ?? "Failed to add lesson");
      }
    });
  };

  const toggleLessonPublished = (m: ModuleNode, l: LessonNode) => {
    const next = !l.published;
    setOutline((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? {
              ...x,
              lessons: x.lessons.map((y) =>
                y.id === l.id ? { ...y, published: next } : y,
              ),
            }
          : x,
      ),
    );
    startTransition(async () => {
      await updateLessonMetaAction({ lessonId: l.id, published: next });
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Top action row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Outline
        </h2>
        <button
          type="button"
          onClick={addModule}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add module
        </button>
      </div>

      {outline.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <FolderClosed className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-base font-semibold">No modules yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Modules group your lessons. Start by adding your first module.
          </p>
          <button
            type="button"
            onClick={addModule}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add module
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {outline.map((m) => (
            <ModuleCard
              key={m.id}
              module={m}
              expanded={expanded.has(m.id)}
              onToggleExpanded={() => toggleExpanded(m.id)}
              onRename={() => renameModule(m)}
              onDelete={() => deleteModule(m)}
              onChangeRelease={(releaseMode) =>
                updateModuleField(m, { releaseMode })
              }
              onChangeDripDays={(dripDays) =>
                updateModuleField(m, { dripDays })
              }
              onChangeDrip={(dripDays) =>
                updateModuleField(m, { releaseMode: "DRIP", dripDays })
              }
              onTogglePublished={() =>
                updateModuleField(m, { published: !m.published })
              }
              onAddLesson={(kind) => addLesson(m, kind)}
              onToggleLessonPublished={(l) => toggleLessonPublished(m, l)}
              groupSlug={groupSlug}
              courseSlug={courseSlug}
              pending={pending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({
  module: m,
  expanded,
  onToggleExpanded,
  onRename,
  onDelete,
  onChangeRelease,
  onChangeDripDays,
  onChangeDrip,
  onTogglePublished,
  onAddLesson,
  onToggleLessonPublished,
  groupSlug,
  courseSlug,
  pending,
}: {
  module: ModuleNode;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRename: () => void;
  onDelete: () => void;
  onChangeRelease: (m: "PUBLISHED" | "DRIP" | "LOCKED") => void;
  onChangeDripDays: (n: number | null) => void;
  /** Set releaseMode = DRIP and dripDays in one shot — used when the admin
   *  picks "Drip" from the dropdown and enters how many days. */
  onChangeDrip: (days: number) => void;
  onTogglePublished: () => void;
  onAddLesson: (kind: "VIDEO" | "TEXT" | "QUIZ" | "ASSIGNMENT") => void;
  onToggleLessonPublished: (l: LessonNode) => void;
  groupSlug: string;
  courseSlug: string;
  pending: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  // Two-step "Drip" picker: clicking Drip swaps the dropdown body to a
  // "How many days?" form. Saving applies both releaseMode + dripDays.
  const [dripEditing, setDripEditing] = useState(false);
  const [dripValue, setDripValue] = useState<string>(
    m.dripDays != null ? String(m.dripDays) : "7",
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Module header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <FolderOpen className="h-4 w-4" /> : <FolderClosed className="h-4 w-4" />}
        </span>
        <button
          type="button"
          onClick={onRename}
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold transition-colors hover:text-primary"
          title="Rename"
        >
          {m.title}
        </button>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {m.lessons.length} lesson{m.lessons.length === 1 ? "" : "s"}
        </span>

        <StatusPill
          published={m.published}
          releaseMode={m.releaseMode}
          dripDays={m.dripDays}
        />

        {/* Release dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setReleaseOpen((v) => !v)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Release
            <ChevronDown className="h-3 w-3" />
          </button>
          {releaseOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => {
                  setReleaseOpen(false);
                  setDripEditing(false);
                }}
              />
              <div className="absolute right-0 top-full z-40 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
                {dripEditing ? (
                  // ── Drip sub-form ──────────────────────────────────────
                  <div className="space-y-2 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Hourglass className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      Unlock after
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={3650}
                        value={dripValue}
                        onChange={(e) => setDripValue(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const n = Math.max(1, parseInt(dripValue, 10) || 1);
                            onChangeDrip(n);
                            setDripEditing(false);
                            setReleaseOpen(false);
                          }
                          if (e.key === "Escape") {
                            setDripEditing(false);
                          }
                        }}
                        className="h-7 w-16 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">days</span>
                    </div>
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      Members see this lesson{m.dripDays != null ? " " : " "}
                      <strong className="text-foreground/80">
                        {dripValue || "—"} day{dripValue === "1" ? "" : "s"}
                      </strong>{" "}
                      after they enroll.
                    </p>
                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setDripEditing(false)}
                        className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const n = Math.max(1, parseInt(dripValue, 10) || 1);
                          onChangeDrip(n);
                          setDripEditing(false);
                          setReleaseOpen(false);
                        }}
                        className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  // ── Main dropdown ──────────────────────────────────────
                  <>
                    {RELEASE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const active = m.releaseMode === opt.value;
                      const isDrip = opt.value === "DRIP";
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            if (isDrip) {
                              // Open the sub-form instead of saving immediately;
                              // Drip is meaningless without a day count.
                              setDripValue(
                                m.dripDays != null ? String(m.dripDays) : "7",
                              );
                              setDripEditing(true);
                              return;
                            }
                            setReleaseOpen(false);
                            onChangeRelease(opt.value);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent",
                            active && "bg-accent",
                          )}
                        >
                          <Icon className={cn("h-3.5 w-3.5", opt.color)} />
                          <span className="flex-1 text-left">
                            {opt.label}
                            {isDrip && m.dripDays != null && (
                              <span className="ms-1 text-[10px] text-muted-foreground">
                                ({m.dripDays}d)
                              </span>
                            )}
                          </span>
                          {active && <Check className="h-3 w-3 text-primary" />}
                        </button>
                      );
                    })}
                    <div className="border-t border-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setReleaseOpen(false);
                        onTogglePublished();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      {m.published ? (
                        <>
                          <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Set as Draft</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                          <span>Publish</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Add Content */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <Plus className="h-3 w-3" />
            Add content
          </button>
          {addOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAddOpen(false)} />
              <div className="absolute right-0 top-full z-40 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
                <ContentMenuItem
                  icon={Video}
                  label="Add Lesson"
                  onClick={() => {
                    setAddOpen(false);
                    onAddLesson("VIDEO");
                  }}
                />
                <ContentMenuItem
                  icon={FileText}
                  label="Add Text Lesson"
                  onClick={() => {
                    setAddOpen(false);
                    onAddLesson("TEXT");
                  }}
                />
                <ContentMenuItem
                  icon={HelpCircle}
                  label="Add Quiz"
                  onClick={() => {
                    setAddOpen(false);
                    onAddLesson("QUIZ");
                  }}
                  hint="Phase 2"
                />
                <ContentMenuItem
                  icon={ClipboardList}
                  label="Add Assignment"
                  onClick={() => {
                    setAddOpen(false);
                    onAddLesson("ASSIGNMENT");
                  }}
                  hint="Phase 2"
                />
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete module"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Drip-days inline input when DRIP */}
      {m.releaseMode === "DRIP" && expanded && (
        <div className="flex items-center gap-2 border-t border-border bg-amber-500/5 px-4 py-2 text-xs">
          <Hourglass className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
          <span className="text-muted-foreground">
            Unlocks
          </span>
          <input
            type="number"
            min={0}
            max={3650}
            value={m.dripDays ?? 0}
            onChange={(e) => onChangeDripDays(Number(e.target.value))}
            className="w-16 rounded-md border border-input bg-background px-2 py-0.5 text-xs"
          />
          <span className="text-muted-foreground">days after enrollment</span>
        </div>
      )}

      {/* Lessons — wrapped in an overflow-hidden + rounded-b shell so hover
          backgrounds clip cleanly at the card's rounded bottom corners
          (the outer card itself can't be overflow-hidden because the
          Add-content / Release dropdowns need to escape it). */}
      {expanded && m.lessons.length > 0 && (
        <ul className="overflow-hidden rounded-b-xl border-t border-border">
          {m.lessons.map((l) => {
            const Icon = lessonIcon(l.kind);
            return (
              <li
                key={l.id}
                className="flex items-center gap-2 border-t border-border first:border-t-0 px-4 py-2 hover:bg-accent/30"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Link
                  href={`/groups/${groupSlug}/learning/${courseSlug}/lessons/${l.slug}/edit`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
                >
                  {l.title}
                </Link>
                <StatusPill
                  published={l.published}
                  releaseMode={l.releaseMode}
                  dripDays={l.dripDays}
                  small
                />
                <button
                  type="button"
                  onClick={() => onToggleLessonPublished(l)}
                  disabled={pending}
                  title={l.published ? "Unpublish" : "Publish"}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {l.published ? (
                    <CircleDashed className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
                <Link
                  href={`/groups/${groupSlug}/learning/${courseSlug}/lessons/${l.slug}/edit`}
                  title="Edit"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {expanded && m.lessons.length === 0 && (
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          No content yet. Use <span className="font-semibold">Add content</span> to add a lesson, quiz, or assignment.
        </div>
      )}
    </div>
  );
}

function ContentMenuItem({
  icon: Icon,
  label,
  onClick,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {hint && (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
          {hint}
        </span>
      )}
    </button>
  );
}
