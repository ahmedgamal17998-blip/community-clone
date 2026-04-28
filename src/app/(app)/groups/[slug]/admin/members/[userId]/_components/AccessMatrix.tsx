"use client";

/**
 * Per-resource access matrix.
 *
 * Three states per row:
 *   • Granted (green)  — member has access (default for active members, or
 *                         via explicit GRANT record)
 *   • Locked (red)     — explicit DENY record blocks the member
 *   • Reset            — no record; falls back to defaults
 *
 * Toggle: click "Granted" → flips to DENY (locks the channel for this member).
 *         click "Locked"  → removes the DENY (back to default access).
 */

import { useTransition, useState } from "react";
import {
  Hash,
  MessageSquare,
  GraduationCap,
  Lock,
  Check,
  Infinity as InfinityIcon,
} from "lucide-react";
import {
  grantAccessAction,
  lockAccessAction,
  revokeAccessAction,
} from "@/server/actions/access";
import type { ResourceType } from "@/server/access";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Channel = { id: string; name: string; slug: string; kind?: string };
type Course = { id: string; title: string; slug: string };
type ChatThread = { id: string; title: string | null };

type Access = {
  resourceType: string;
  resourceId: string;
  mode: string; // GRANT | DENY
  expiresAt: Date | null;
};

type Props = {
  groupId: string;
  userId: string;
  channels: Channel[];
  courses: Course[];
  chatThreads: ChatThread[];
  accesses: Access[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function fmtExpiry(d: Date | null): string {
  if (!d) return "Never expires";
  const date = new Date(d);
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Expired ${-days}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days}d`;
}

// ═════════════════════════════════════════════════════════════════════════════

export function AccessMatrix({
  groupId,
  userId,
  channels,
  courses,
  chatThreads,
  accesses,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<Access[]>(accesses);

  const recordOf = (type: ResourceType, id: string) =>
    local.find((a) => a.resourceType === type && a.resourceId === id);

  /**
   * Effective state for a resource row, given current local state:
   *   "denied"  → explicit DENY record exists & not expired
   *   "granted" → explicit GRANT record OR default-allow (no record at all
   *                — admin sees green by default for active members)
   */
  const stateOf = (type: ResourceType, id: string): "granted" | "denied" => {
    const r = recordOf(type, id);
    if (!r) return "granted"; // default-allow assumption (matches hasAccess)
    if (r.expiresAt && new Date(r.expiresAt) <= new Date()) return "granted"; // expired record acts as no record
    return r.mode === "DENY" ? "denied" : "granted";
  };

  const lock = (type: ResourceType, id: string, expiresAt: Date | null) => {
    startTransition(async () => {
      await lockAccessAction({
        groupId,
        userId,
        resourceType: type,
        resourceId: id,
        expiresAt,
      });
      setLocal((p) => [
        ...p.filter((a) => !(a.resourceType === type && a.resourceId === id)),
        { resourceType: type, resourceId: id, mode: "DENY", expiresAt },
      ]);
    });
  };

  const unlock = (type: ResourceType, id: string) => {
    startTransition(async () => {
      await revokeAccessAction({
        groupId,
        userId,
        resourceType: type,
        resourceId: id,
      });
      setLocal((p) =>
        p.filter((a) => !(a.resourceType === type && a.resourceId === id)),
      );
    });
  };

  // Used by the date pickers — when locked, sets/extends the lock duration.
  // (Admin can lock for 30d → automatically unlocks after 30d.)
  const setLockExpiry = (
    type: ResourceType,
    id: string,
    expiresAt: Date | null,
  ) => {
    startTransition(async () => {
      await lockAccessAction({
        groupId,
        userId,
        resourceType: type,
        resourceId: id,
        expiresAt,
      });
      setLocal((p) => [
        ...p.filter((a) => !(a.resourceType === type && a.resourceId === id)),
        { resourceType: type, resourceId: id, mode: "DENY", expiresAt },
      ]);
    });
  };

  // ── Single row ─────────────────────────────────────────────────────────────
  const Row = ({
    type,
    id,
    label,
    icon,
  }: {
    type: ResourceType;
    id: string;
    label: string;
    icon: React.ReactNode;
  }) => {
    const state = stateOf(type, id);
    const granted = state === "granted";
    const r = recordOf(type, id);
    const isExplicitDeny = r?.mode === "DENY";
    const exp = r?.expiresAt ?? null;
    const expStr = exp ? new Date(exp).toISOString().slice(0, 10) : "";

    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
        {/* Label */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "shrink-0",
              granted ? "text-muted-foreground" : "text-destructive/70",
            )}
          >
            {icon}
          </span>
          <span
            className={cn(
              "truncate text-sm font-medium",
              granted ? "" : "text-muted-foreground line-through",
            )}
          >
            {label}
          </span>
        </div>

        {/* Status pill — toggles GRANT ↔ DENY */}
        <button
          type="button"
          onClick={() =>
            granted ? lock(type, id, null) : unlock(type, id)
          }
          disabled={pending}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
            granted
              ? "bg-green-500/10 text-green-700 hover:bg-green-500/15 dark:text-green-400"
              : "bg-destructive/10 text-destructive hover:bg-destructive/15",
          )}
          title={granted ? "Click to lock for this member" : "Click to unlock"}
        >
          {granted ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {granted ? "Granted" : "Locked"}
        </button>

        {/* Lock-duration controls — only when locked */}
        {isExplicitDeny ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="date"
              disabled={pending}
              value={expStr}
              onChange={(e) =>
                setLockExpiry(
                  type,
                  id,
                  e.target.value ? new Date(e.target.value) : null,
                )
              }
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              title="Auto-unlock on this date"
            />
            <div className="flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5">
              <button
                type="button"
                onClick={() => setLockExpiry(type, id, addDays(30))}
                disabled={pending}
                title="Lock for 30 days"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                30d
              </button>
              <button
                type="button"
                onClick={() => setLockExpiry(type, id, addDays(60))}
                disabled={pending}
                title="Lock for 60 days"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                60d
              </button>
              <button
                type="button"
                onClick={() => setLockExpiry(type, id, addDays(90))}
                disabled={pending}
                title="Lock for 90 days"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                90d
              </button>
              <button
                type="button"
                onClick={() => setLockExpiry(type, id, null)}
                disabled={pending}
                title="Lock indefinitely"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <InfinityIcon className="h-3 w-3" />
              </button>
            </div>
            <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground sm:inline">
              {exp ? `Auto-unlock ${fmtExpiry(exp).replace("Expires", "in")}` : "Permanent"}
            </span>
          </div>
        ) : null}
      </div>
    );
  };

  // ── Section heading ────────────────────────────────────────────────────────
  const Section = ({
    title,
    count,
    children,
  }: {
    title: string;
    count: number;
    children: React.ReactNode;
  }) => (
    <div>
      <h3 className="mb-1.5 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span className="text-[10px] font-normal normal-case">({count})</span>
      </h3>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {children}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        By default, active members can see all resources. Click <span className="font-semibold text-green-700 dark:text-green-400">Granted</span> to lock a specific resource — the member will see it dimmed with a lock icon.
      </p>

      {channels.length > 0 && (
        <Section title="Channels" count={channels.length}>
          {channels.map((c) => (
            <Row
              key={c.id}
              type="CHANNEL"
              id={c.id}
              label={`#${c.slug}`}
              icon={<Hash className="h-4 w-4" />}
            />
          ))}
        </Section>
      )}

      {chatThreads.length > 0 && (
        <Section title="Group Chats" count={chatThreads.length}>
          {chatThreads.map((t) => (
            <Row
              key={t.id}
              type="CHAT"
              id={t.id}
              label={t.title ?? "Untitled chat"}
              icon={<MessageSquare className="h-4 w-4" />}
            />
          ))}
        </Section>
      )}

      {courses.length > 0 && (
        <Section title="Courses" count={courses.length}>
          {courses.map((c) => (
            <Row
              key={c.id}
              type="COURSE"
              id={c.id}
              label={c.title}
              icon={<GraduationCap className="h-4 w-4" />}
            />
          ))}
        </Section>
      )}

      {channels.length === 0 && chatThreads.length === 0 && courses.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No resources yet. Create channels, group chats, or courses first.
        </p>
      )}
    </div>
  );
}
