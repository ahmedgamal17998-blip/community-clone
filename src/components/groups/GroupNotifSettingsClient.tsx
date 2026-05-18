"use client";

import { useState, useTransition } from "react";
import { Bell, Users, CreditCard, Calendar, Megaphone, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { updateGroupNotifSettingsAction } from "@/server/group-notif-settings";
import type { GroupNotifSettings } from "@/server/group-notif-settings";

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  icon: Icon,
  label,
  description,
  audience,
  checked,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  audience: "admin" | "member";
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition-colors select-none">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        audience === "admin"
          ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
          : "bg-primary/10 text-primary"
      }`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            audience === "admin"
              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
              : "bg-primary/10 text-primary"
          }`}>
            {audience === "admin" ? "Admins" : "Members"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="mt-0.5 shrink-0">
        <div
          onClick={(e) => { e.preventDefault(); onChange(!checked); }}
          className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${
            checked ? "bg-primary" : "bg-muted"
          }`}
        >
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "left-[calc(100%-18px)]" : "left-0.5"
          }`} />
        </div>
      </div>
    </label>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GroupNotifSettingsClient({
  groupId,
  initialSettings,
}: {
  groupId: string;
  initialSettings: GroupNotifSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<null | { ok: boolean; error?: string }>(null);

  const set = <K extends keyof GroupNotifSettings>(key: K, value: boolean) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setStatus(null);
  };

  const save = () => {
    startTransition(async () => {
      const res = await updateGroupNotifSettingsAction(groupId, settings);
      setStatus(res.ok ? { ok: true } : { ok: false, error: res.error });
    });
  };

  const TOGGLES: Array<{
    key: keyof GroupNotifSettings;
    icon: React.ElementType;
    label: string;
    description: string;
    audience: "admin" | "member";
  }> = [
    {
      key: "adminOnNewMember",
      icon: Users,
      label: "New member joined",
      description: "Admins get a bell notification when a new member becomes active in the group.",
      audience: "admin",
    },
    {
      key: "adminOnSubRequest",
      icon: CreditCard,
      label: "New payment / subscription request",
      description: "Admins are notified when a member submits a payment proof or subscription request awaiting approval.",
      audience: "admin",
    },
    {
      key: "memberOnEventReminder",
      icon: Calendar,
      label: "Event reminders",
      description: "Members who RSVP'd receive a bell notification ~24 hours before the event starts.",
      audience: "member",
    },
    {
      key: "memberOnNewPost",
      icon: FileText,
      label: "New posts in channels",
      description: "Members receive a notification when a new post is published in any channel they can access. Off by default to prevent notification spam.",
      audience: "member",
    },
    {
      key: "memberOnAnnouncement",
      icon: Megaphone,
      label: "Admin announcements",
      description: "Members receive a bell notification when an admin publishes a new announcement.",
      audience: "member",
    },
  ];

  return (
    <div className="space-y-4">

      {/* What goes where — info box */}
      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">Where do notifications appear?</p>
            <ul className="mt-1 space-y-1">
              <li>🔔 <strong>Bell icon</strong> — All events below appear in the in-app notification bell.</li>
              <li>📧 <strong>Email</strong> — Each member can choose per-type delivery (IN_APP / EMAIL / BOTH) in their personal settings.</li>
              <li>💬 <strong>Inbox (DMs)</strong> — Only direct messages between users. System events never go to inbox.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        {TOGGLES.map(({ key, icon, label, description, audience }) => (
          <ToggleRow
            key={key}
            icon={icon}
            label={label}
            description={description}
            audience={audience}
            checked={settings[key]}
            onChange={(v) => set(key, v)}
          />
        ))}
      </div>

      {/* Save bar */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save notification settings"}
        </button>
        {status && (
          status.ok
            ? <span className="flex items-center gap-1.5 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>
            : <span className="flex items-center gap-1.5 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" /> {status.error}</span>
        )}
      </div>
    </div>
  );
}
