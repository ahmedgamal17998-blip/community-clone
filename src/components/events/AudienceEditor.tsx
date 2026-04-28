"use client";

/**
 * AudienceEditor — admin-only UI for targeting an event.
 *
 * • Toggle "Open to everyone" vs "Restrict audience"
 * • When restricted: list of rules + "+ Add rule" dropdown
 * • Each rule has its own picker (channel / course / role / member)
 * • Rules combine OR: a viewer who matches ANY rule can see the event
 *
 * Professional + simple — every rule is one row with its info + remove button.
 */

import { useState, useTransition } from "react";
import {
  Hash,
  GraduationCap,
  ShieldCheck,
  User as UserIcon,
  Globe,
  Plus,
  X,
  ChevronDown,
} from "lucide-react";
import {
  setEventAudienceModeAction,
  addAudienceRuleAction,
  removeAudienceRuleAction,
} from "@/server/event-audience-actions";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Channel = { id: string; slug: string; name: string };
type Course = { id: string; slug: string; title: string };
type Member = { id: string; name: string | null; handle: string };
type Role = "OWNER" | "ADMIN" | "CONTRIBUTOR" | "MEMBER";

type Rule = {
  id: string;
  type: string; // ALL | CHANNEL | COURSE | ROLE_LEVEL | MEMBER
  channelId: string | null;
  courseId: string | null;
  minRole: string | null;
  userId: string | null;
};

type Props = {
  eventId: string;
  initialMode: string; // ALL | RESTRICTED
  initialRules: Rule[];
  channels: Channel[];
  courses: Course[];
  members: Member[];
};

// ── Role display ─────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owners",
  ADMIN: "Admins & up",
  CONTRIBUTOR: "Contributors & up",
  MEMBER: "All members",
};

// ═════════════════════════════════════════════════════════════════════════════

export function AudienceEditor({
  eventId,
  initialMode,
  initialRules,
  channels,
  courses,
  members,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<string>(initialMode);
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<
    "" | "CHANNEL" | "COURSE" | "ROLE_LEVEL" | "MEMBER"
  >("");

  const channelById = new Map(channels.map((c) => [c.id, c]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const switchMode = (next: "ALL" | "RESTRICTED") => {
    if (next === mode) return;
    setMode(next);
    startTransition(async () => {
      await setEventAudienceModeAction({ eventId, mode: next });
    });
  };

  const removeRule = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    startTransition(async () => {
      await removeAudienceRuleAction({ ruleId });
    });
  };

  const addRule = (
    fields: Parameters<typeof addAudienceRuleAction>[0],
  ) => {
    startTransition(async () => {
      const res = await addAudienceRuleAction(fields);
      if (res?.ok && res.ruleId) {
        setRules((prev) => [
          ...prev,
          {
            id: res.ruleId!,
            type: fields.type,
            channelId: fields.channelId ?? null,
            courseId: fields.courseId ?? null,
            minRole: fields.minRole ?? null,
            userId: fields.userId ?? null,
          },
        ]);
        setAddType("");
        setAddOpen(false);
      } else if (res && !res.ok) {
        alert(res.error ?? "Failed to add rule");
      }
    });
  };

  // ── Rule label ─────────────────────────────────────────────────────────────
  const renderRule = (r: Rule) => {
    if (r.type === "CHANNEL") {
      const c = r.channelId ? channelById.get(r.channelId) : null;
      return (
        <RuleRow
          icon={<Hash className="h-4 w-4 text-muted-foreground" />}
          label="Channel"
          value={c ? `#${c.slug}` : "(unknown channel)"}
          onRemove={() => removeRule(r.id)}
          pending={pending}
        />
      );
    }
    if (r.type === "COURSE") {
      const c = r.courseId ? courseById.get(r.courseId) : null;
      return (
        <RuleRow
          icon={<GraduationCap className="h-4 w-4 text-muted-foreground" />}
          label="Course"
          value={c ? c.title : "(unknown course)"}
          onRemove={() => removeRule(r.id)}
          pending={pending}
        />
      );
    }
    if (r.type === "ROLE_LEVEL") {
      return (
        <RuleRow
          icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
          label="Role"
          value={r.minRole ? (ROLE_LABEL[r.minRole as Role] ?? r.minRole) : "(no role)"}
          onRemove={() => removeRule(r.id)}
          pending={pending}
        />
      );
    }
    if (r.type === "MEMBER") {
      const m = r.userId ? memberById.get(r.userId) : null;
      return (
        <RuleRow
          icon={<UserIcon className="h-4 w-4 text-muted-foreground" />}
          label="Member"
          value={m ? (m.name ?? `@${m.handle}`) : "(unknown member)"}
          onRemove={() => removeRule(r.id)}
          pending={pending}
        />
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold">Who can see this event?</h3>
        <p className="text-xs text-muted-foreground">
          Restrict the event to specific channels, courses, roles, or members. Rules combine with OR — anyone matching any rule sees it.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <ModeButton
          active={mode === "ALL"}
          onClick={() => switchMode("ALL")}
          icon={<Globe className="h-4 w-4" />}
          label="Open to everyone"
          hint="All active members see this event"
        />
        <ModeButton
          active={mode === "RESTRICTED"}
          onClick={() => switchMode("RESTRICTED")}
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Restrict audience"
          hint="Only members matching a rule below"
        />
      </div>

      {/* Rules list — only when RESTRICTED */}
      {mode === "RESTRICTED" && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rules ({rules.length})
          </h4>

          {rules.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
              No rules yet. Add at least one rule below — without a rule no one will see this event.
            </p>
          ) : (
            <ul className="space-y-1.5">{rules.map((r) => <li key={r.id}>{renderRule(r)}</li>)}</ul>
          )}

          {/* Add rule */}
          <div className="border-t border-border pt-3">
            {addType === "" ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAddOpen((v) => !v)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add rule
                  <ChevronDown className="h-3 w-3" />
                </button>
                {addOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setAddOpen(false)} />
                    <div className="absolute left-0 top-full z-40 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
                      <AddItem
                        icon={Hash}
                        label="Channel members"
                        onClick={() => { setAddType("CHANNEL"); setAddOpen(false); }}
                      />
                      <AddItem
                        icon={GraduationCap}
                        label="Course members"
                        onClick={() => { setAddType("COURSE"); setAddOpen(false); }}
                      />
                      <AddItem
                        icon={ShieldCheck}
                        label="By role"
                        onClick={() => { setAddType("ROLE_LEVEL"); setAddOpen(false); }}
                      />
                      <AddItem
                        icon={UserIcon}
                        label="Specific member"
                        onClick={() => { setAddType("MEMBER"); setAddOpen(false); }}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <RulePicker
                eventId={eventId}
                type={addType}
                channels={channels}
                courses={courses}
                members={members}
                onCancel={() => setAddType("")}
                onAdd={addRule}
                pending={pending}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ModeButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-start gap-2 rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      <span className={cn("mt-0.5 shrink-0", active ? "text-primary" : "text-muted-foreground")}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-bold", active && "text-primary")}>
          {label}
        </div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </button>
  );
}

function RuleRow({
  icon,
  label,
  value,
  onRemove,
  pending,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onRemove: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        aria-label="Remove rule"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{label}</span>
    </button>
  );
}

// ── Rule picker (per-type) ──────────────────────────────────────────────────

function RulePicker({
  eventId,
  type,
  channels,
  courses,
  members,
  onCancel,
  onAdd,
  pending,
}: {
  eventId: string;
  type: "CHANNEL" | "COURSE" | "ROLE_LEVEL" | "MEMBER";
  channels: Channel[];
  courses: Course[];
  members: Member[];
  onCancel: () => void;
  onAdd: (fields: Parameters<typeof addAudienceRuleAction>[0]) => void;
  pending: boolean;
}) {
  const [channelId, setChannelId] = useState<string>(channels[0]?.id ?? "");
  const [courseId, setCourseId] = useState<string>(courses[0]?.id ?? "");
  const [minRole, setMinRole] = useState<Role>("MEMBER");
  const [userId, setUserId] = useState<string>(members[0]?.id ?? "");

  const submit = () => {
    if (type === "CHANNEL") {
      if (!channelId) return;
      onAdd({ eventId, type, channelId });
    } else if (type === "COURSE") {
      if (!courseId) return;
      onAdd({ eventId, type, courseId });
    } else if (type === "ROLE_LEVEL") {
      onAdd({ eventId, type, minRole });
    } else if (type === "MEMBER") {
      if (!userId) return;
      onAdd({ eventId, type, userId });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
      {type === "CHANNEL" && (
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        >
          {channels.length === 0 ? (
            <option value="">No channels</option>
          ) : (
            channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.slug}
              </option>
            ))
          )}
        </select>
      )}

      {type === "COURSE" && (
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        >
          {courses.length === 0 ? (
            <option value="">No courses</option>
          ) : (
            courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))
          )}
        </select>
      )}

      {type === "ROLE_LEVEL" && (
        <select
          value={minRole}
          onChange={(e) => setMinRole(e.target.value as Role)}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        >
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      )}

      {type === "MEMBER" && (
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        >
          {members.length === 0 ? (
            <option value="">No members</option>
          ) : (
            members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? `@${m.handle}`}
              </option>
            ))
          )}
        </select>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
