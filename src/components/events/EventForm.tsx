"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createEventAction, updateEventAction } from "@/server/events";
import { listTimezones } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const COLOR_SWATCHES = [
  "#6d56f0", // brand purple
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#64748b", // slate
];

type InitialEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string; // ISO local datetime for input
  endsAt: string;
  timezone: string;
  color: string;
  category: string | null;
  locationUrl: string | null;
  recurrence: "NONE" | "WEEKLY";
  recurrenceEndsAt: string | null;
};

export function EventForm({
  groupId,
  groupSlug,
  initial,
}: {
  groupId: string;
  groupSlug: string;
  initial?: InitialEvent;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const browserTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? defaultStart());
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? defaultEnd());
  const [timezone, setTimezone] = useState(initial?.timezone ?? browserTz);
  const [color, setColor] = useState(initial?.color ?? COLOR_SWATCHES[0]);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [locationUrl, setLocationUrl] = useState(initial?.locationUrl ?? "");
  const [recurrence, setRecurrence] = useState<"NONE" | "WEEKLY">(
    initial?.recurrence ?? "NONE",
  );
  const [recurrenceEndsAt, setRecurrenceEndsAt] = useState(
    initial?.recurrenceEndsAt ?? "",
  );

  const timezones = useMemo(() => listTimezones(), []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.append("groupId", groupId);
    fd.append("title", title);
    fd.append("description", description);
    fd.append("startsAt", new Date(startsAt).toISOString());
    fd.append("endsAt", new Date(endsAt).toISOString());
    fd.append("timezone", timezone);
    fd.append("color", color);
    fd.append("category", category);
    fd.append("locationUrl", locationUrl);
    fd.append("recurrence", recurrence);
    if (recurrence === "WEEKLY" && recurrenceEndsAt) {
      fd.append("recurrenceEndsAt", new Date(recurrenceEndsAt).toISOString());
    }

    start(async () => {
      if (initial) {
        fd.append("eventId", initial.id);
        const r = await updateEventAction(fd);
        if (!r?.ok) {
          setError(r?.error ?? "Failed to save");
          return;
        }
        router.push(`/groups/${groupSlug}/events/${initial.id}`);
        router.refresh();
      } else {
        const r = await createEventAction(fd);
        if (!r?.ok) {
          setError(r?.error ?? "Failed to create");
          return;
        }
        router.push(`/groups/${groupSlug}/events/${r.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="startsAt">Starts</Label>
          <Input
            id="startsAt"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="endsAt">Ends</Label>
          <Input
            id="endsAt"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Q&A, Workshop"
            maxLength={64}
          />
        </div>
      </div>
      <div>
        <Label>Color</Label>
        <div className="mt-1 flex gap-2">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition",
                color === c ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="locationUrl">Location URL (Meet / Zoom / map)</Label>
        <Input
          id="locationUrl"
          type="url"
          value={locationUrl}
          onChange={(e) => setLocationUrl(e.target.value)}
          placeholder="https://meet.google.com/..."
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="recurrence">Recurrence</Label>
          <select
            id="recurrence"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as "NONE" | "WEEKLY")}
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="NONE">Does not repeat</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </div>
        {recurrence === "WEEKLY" ? (
          <div>
            <Label htmlFor="recurrenceEndsAt">Repeat until (optional)</Label>
            <Input
              id="recurrenceEndsAt"
              type="datetime-local"
              value={recurrenceEndsAt}
              onChange={(e) => setRecurrenceEndsAt(e.target.value)}
            />
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Create event"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
}
function defaultEnd(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  return toLocalInput(d);
}
