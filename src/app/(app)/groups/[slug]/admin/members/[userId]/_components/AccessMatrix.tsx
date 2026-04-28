"use client";

/**
 * Per-resource access matrix.
 *
 * Per row, the admin sees the effective state for the member:
 *   • Granted (green) — has access (default-allow or explicit GRANT record)
 *   • Locked  (red)   — explicit DENY record blocks the member
 *
 * For both states, the admin can set a duration:
 *   • Granted with expiry  → access auto-revokes on that date
 *   • Locked with expiry   → lock auto-clears on that date
 *
 * The status pill toggles GRANT ↔ DENY. Quick buttons (30/60/90 / ∞) and a
 * date picker let the admin pick the expiry; "∞" = permanent.
 */

import { useTransition, useState } from "react";
import {
  Hash,
  MessageSquare,
  GraduationCap,
  CalendarDays,
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
type EventRow = { id: string; title: string; startsAt: Date };

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
  events: EventRow[];
  accesses: Access[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function fmtRemaining(d: Date | null): string {
  if (!d) return "permanent";
  const date = new Date(d);
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `expired ${-days}d ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

// ═════════════════════════════════════════════════════════════════════════════

export function AccessMatrix({
  groupId,
  userId,
  channels,
  courses,
  chatThreads,
  events,
  accesses,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<Access[]>(accesses);

  const recordOf = (type: ResourceType, id: string) =>
    local.find((a) => a.resourceType === type && a.resourceId === id);

  const stateOf = (type: ResourceType, id: string): "granted" | "denied" => {
    const r = recordOf(type, id);
    if (!r) return "granted"; // default-allow for active members
    if (r.expiresAt && new Date(r.expiresAt) <= new Date()) return "granted"; // expired record = no record
    return r.mode === "DENY" ? "denied" : "granted";
  };

  const writeRecord = (
    type: ResourceType,
    id: string,
    mode: "GRANT" | "DENY",
    expiresAt: Date | null,
  ) => {
    startTransition(async () => {
      const fn = mode === "DENY" ? lockAccessAction : grantAccessAction;
      await fn({ groupId, userId, resourceType: type, resourceId: id, expiresAt });
      setLocal((p) => [
        ...p.filter((a) => !(a.resourceType === type && a.resourceId === id)),
        { resourceType: type, resourceId: id, mode, expiresAt },
      ]);
    });
  };

  const clearRecord = (type: ResourceType, id: string) => {
    startTransition(async () => {
      await revokeAccessAction({ groupId, userId, resourceType: type, resourceId: id });
      setLocal((p) =>
        p.filter((a) => !(a.resourceType === type && a.resourceId === id)),
      );
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
    const hasExplicitRecord = !!r && (!r.expiresAt || new Date(r.expiresAt) > new Date());
    const exp = r?.expiresAt ?? null;
    const expStr = exp ? new Date(exp).toISOString().slice(0, 10) : "";

    // The "mode" for new writes follows the current state:
    //   - granted state → toggle into DENY (lock)
    //   - denied state  → unlock (clear record)
    // Duration controls write into the CURRENT state's mode (GRANT or DENY).
    const currentMode: "GRANT" | "DENY" = granted ? "GRANT" : "DENY";

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
            granted
              ? writeRecord(type, id, "DENY", null)
              : clearRecord(type, id)
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

        {/* Duration controls — for BOTH states */}
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            type="date"
            disabled={pending}
            value={expStr}
            onChange={(e) =>
              writeRecord(
                type,
                id,
                currentMode,
                e.target.value ? new Date(e.target.value) : null,
              )
            }
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            title={
              granted
                ? "Auto-revoke access on this date"
                : "Auto-unlock on this date"
            }
          />
          <div className="flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5">
            <button
              type="button"
              onClick={() => writeRecord(type, id, currentMode, addDays(30))}
              disabled={pending}
              title={granted ? "Allow for 30 days" : "Lock for 30 days"}
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              30d
            </button>
            <button
              type="button"
              onClick={() => writeRecord(type, id, currentMode, addDays(60))}
              disabled={pending}
              title={granted ? "Allow for 60 days" : "Lock for 60 days"}
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              60d
            </button>
            <button
              type="button"
              onClick={() => writeRecord(type, id, currentMode, addDays(90))}
              disabled={pending}
              title={granted ? "Allow for 90 days" : "Lock for 90 days"}
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              90d
            </button>
            <button
              type="button"
              onClick={() => writeRecord(type, id, currentMode, null)}
              disabled={pending}
              title={granted ? "Permanent access" : "Permanent lock"}
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <InfinityIcon className="h-3 w-3" />
            </button>
          </div>
          <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground sm:inline">
            {hasExplicitRecord
              ? granted
                ? `Auto-revoke ${fmtRemaining(exp)}`
                : `Auto-unlock ${fmtRemaining(exp)}`
              : "Default access"}
          </span>
        </div>
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
        By default, active members can see all resources. Click{" "}
        <span className="font-semibold text-green-700 dark:text-green-400">Granted</span>{" "}
        to lock a specific resource for this member, or set a duration for
        time-limited access/lock.
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

      {events.length > 0 && (
        <Section title="Events" count={events.length}>
          {events.map((e) => (
            <Row
              key={e.id}
              type="EVENT"
              id={e.id}
              label={`${e.title} · ${new Date(e.startsAt).toLocaleDateString()}`}
              icon={<CalendarDays className="h-4 w-4" />}
            />
          ))}
        </Section>
      )}

      {channels.length === 0 &&
        chatThreads.length === 0 &&
        courses.length === 0 &&
        events.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No resources yet. Create channels, group chats, courses, or events first.
          </p>
        )}
    </div>
  );
}
