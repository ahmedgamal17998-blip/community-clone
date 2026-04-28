"use client";

/**
 * Per-resource access matrix.
 *
 * Lets the admin grant/revoke access to channels, group chats, and courses
 * for a specific member, and set an expiry date per resource.
 *
 * Visual: clean rows, status pill, date picker + quick "+30d / +60d / +90d / ∞"
 * Professional + simple — no clutter.
 */

import { useTransition, useState } from "react";
import { Hash, MessageSquare, GraduationCap, Lock, Check, Infinity as InfinityIcon } from "lucide-react";
import { grantAccessAction, revokeAccessAction } from "@/server/actions/access";
import type { ResourceType } from "@/server/access";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Channel = { id: string; name: string; slug: string; kind?: string };
type Course = { id: string; title: string; slug: string };
type ChatThread = { id: string; title: string | null };

type Access = {
  resourceType: string;
  resourceId: string;
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

  const accessOf = (type: ResourceType, id: string) =>
    local.find((a) => a.resourceType === type && a.resourceId === id);

  const isGranted = (type: ResourceType, id: string) => {
    const a = accessOf(type, id);
    if (!a) return false;
    return !a.expiresAt || new Date(a.expiresAt) > new Date();
  };

  const grant = (type: ResourceType, id: string, expiresAt: Date | null) => {
    startTransition(async () => {
      await grantAccessAction({ groupId, userId, resourceType: type, resourceId: id, expiresAt });
      setLocal((p) => [
        ...p.filter((a) => !(a.resourceType === type && a.resourceId === id)),
        { resourceType: type, resourceId: id, expiresAt },
      ]);
    });
  };

  const revoke = (type: ResourceType, id: string) => {
    startTransition(async () => {
      await revokeAccessAction({ groupId, userId, resourceType: type, resourceId: id });
      setLocal((p) => p.filter((a) => !(a.resourceType === type && a.resourceId === id)));
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
    const granted = isGranted(type, id);
    const exp = accessOf(type, id)?.expiresAt ?? null;
    const expStr = exp ? new Date(exp).toISOString().slice(0, 10) : "";

    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
        {/* Label */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="truncate text-sm font-medium">{label}</span>
        </div>

        {/* Status pill */}
        <button
          type="button"
          onClick={() => (granted ? revoke(type, id) : grant(type, id, null))}
          disabled={pending}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
            granted
              ? "bg-green-500/10 text-green-700 hover:bg-green-500/15 dark:text-green-400"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {granted ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {granted ? "Granted" : "Locked"}
        </button>

        {/* Expiry controls — only when granted */}
        {granted ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="date"
              disabled={pending}
              value={expStr}
              onChange={(e) =>
                grant(type, id, e.target.value ? new Date(e.target.value) : null)
              }
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
            <div className="flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5">
              <button
                type="button"
                onClick={() => grant(type, id, addDays(30))}
                disabled={pending}
                title="Extend 30 days"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                +30d
              </button>
              <button
                type="button"
                onClick={() => grant(type, id, addDays(60))}
                disabled={pending}
                title="Extend 60 days"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                +60d
              </button>
              <button
                type="button"
                onClick={() => grant(type, id, addDays(90))}
                disabled={pending}
                title="Extend 90 days"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                +90d
              </button>
              <button
                type="button"
                onClick={() => grant(type, id, null)}
                disabled={pending}
                title="Never expires"
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <InfinityIcon className="h-3 w-3" />
              </button>
            </div>
            <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground sm:inline">
              {fmtExpiry(exp)}
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
