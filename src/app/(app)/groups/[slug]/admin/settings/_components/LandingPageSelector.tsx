"use client";

import { useState, useTransition } from "react";
import { setDefaultLandingAction } from "../actions";

const PRESETS = [
  { value: "", label: "Default (group home)" },
  { value: "/courses", label: "Courses (Learning)" },
  { value: "/events", label: "Events" },
  { value: "/leaderboard", label: "Leaderboard" },
  { value: "/me", label: "My subscription" },
];

export function LandingPageSelector({
  groupId,
  groupSlug,
  initial,
}: {
  groupId: string;
  groupSlug: string;
  initial: string;
}) {
  const [pending, startTransition] = useTransition();
  const [path, setPath] = useState(initial);
  const [custom, setCustom] = useState(
    PRESETS.some((p) => p.value === initial) ? "" : initial,
  );
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    const finalPath = custom || path;
    startTransition(async () => {
      // Resolve to the absolute path within the group
      const resolved = finalPath
        ? finalPath.startsWith("/")
          ? `/groups/${groupSlug}${finalPath === "/" ? "" : finalPath}`
          : finalPath
        : null;
      await setDefaultLandingAction({
        groupId,
        defaultLandingPath: resolved,
      });
      setSaved(true);
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <select
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setCustom("");
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Custom path e.g. /channels/announcements"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setPath("");
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-green-600">Saved ✓</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        New members redirect here on login. Leave blank for the default group home.
      </p>
    </div>
  );
}
