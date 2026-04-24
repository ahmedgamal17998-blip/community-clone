"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RRule, type Weekday } from "rrule";
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

const WEEKDAY_OPTIONS = [
  { label: "Mon", rrDay: RRule.MO, value: "MO" },
  { label: "Tue", rrDay: RRule.TU, value: "TU" },
  { label: "Wed", rrDay: RRule.WE, value: "WE" },
  { label: "Thu", rrDay: RRule.TH, value: "TH" },
  { label: "Fri", rrDay: RRule.FR, value: "FR" },
  { label: "Sat", rrDay: RRule.SA, value: "SA" },
  { label: "Sun", rrDay: RRule.SU, value: "SU" },
];

type RecurrencePreset = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY_DATE" | "MONTHLY_WEEKDAY" | "CUSTOM";
type EndCondition = "NEVER" | "ON_DATE" | "AFTER_N";

type InitialEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  color: string;
  category: string | null;
  locationUrl: string | null;
  recurrence: string;
  recurrenceEndsAt: string | null;
};

/** Convert a stored recurrence string to the builder preset */
function inferPreset(recurrence: string): RecurrencePreset {
  if (!recurrence || recurrence === "NONE") return "NONE";
  if (recurrence === "DAILY" || recurrence === "FREQ=DAILY") return "DAILY";
  if (recurrence === "WEEKLY" || recurrence === "FREQ=WEEKLY" || recurrence.startsWith("FREQ=WEEKLY;BYDAY=")) return "WEEKLY";
  if (recurrence.startsWith("FREQ=MONTHLY")) return "MONTHLY_DATE";
  return "CUSTOM";
}

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

  // Recurrence builder state
  const [preset, setPreset] = useState<RecurrencePreset>(() => inferPreset(initial?.recurrence ?? "NONE"));
  const [weekdays, setWeekdays] = useState<string[]>(["MO"]);
  const [endCondition, setEndCondition] = useState<EndCondition>("NEVER");
  const [untilDate, setUntilDate] = useState(initial?.recurrenceEndsAt ?? "");
  const [countN, setCountN] = useState("10");
  const [customRrule, setCustomRrule] = useState(
    initial?.recurrence && inferPreset(initial.recurrence) === "CUSTOM" ? initial.recurrence : "",
  );

  const timezones = useMemo(() => listTimezones(), []);

  /** Build the final rrule string from the current picker state */
  const builtRrule = useMemo((): string => {
    if (preset === "NONE") return "NONE";
    if (preset === "CUSTOM") return customRrule.trim() || "NONE";

    let freq: number;
    let byweekday: Weekday[] | undefined;

    switch (preset) {
      case "DAILY":
        freq = RRule.DAILY;
        break;
      case "WEEKLY":
        freq = RRule.WEEKLY;
        byweekday = weekdays
          .map((w) => WEEKDAY_OPTIONS.find((o) => o.value === w)?.rrDay)
          .filter(Boolean) as Weekday[];
        if (byweekday.length === 0) byweekday = undefined;
        break;
      case "MONTHLY_DATE":
        freq = RRule.MONTHLY;
        break;
      case "MONTHLY_WEEKDAY": {
        freq = RRule.MONTHLY;
        // e.g. 1st weekday of start date
        const startD = new Date(startsAt);
        const weekNum = Math.ceil(startD.getDate() / 7);
        const dayOfWeek = startD.getDay(); // 0=Sun
        const rrDays = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];
        byweekday = [rrDays[dayOfWeek]!.nth(weekNum)] as Weekday[];
        break;
      }
      default:
        freq = RRule.WEEKLY;
    }

    const opts: ConstructorParameters<typeof RRule>[0] = { freq, byweekday };

    if (endCondition === "ON_DATE" && untilDate) {
      opts.until = new Date(untilDate);
    } else if (endCondition === "AFTER_N" && countN) {
      opts.count = Math.max(1, parseInt(countN, 10) || 1);
    }

    try {
      const rule = new RRule(opts);
      // Return only the RRULE part (no DTSTART)
      return rule.toString().replace(/^RRULE:/, "");
    } catch {
      return "NONE";
    }
  }, [preset, weekdays, endCondition, untilDate, countN, customRrule, startsAt]);

  /** Plain-English description */
  const rruleText = useMemo((): string => {
    if (builtRrule === "NONE" || !builtRrule) return "";
    try {
      const rule = RRule.fromString(`DTSTART:20240101T000000Z\nRRULE:${builtRrule}`);
      return rule.toText();
    } catch {
      return "";
    }
  }, [builtRrule]);

  function toggleWeekday(val: string) {
    setWeekdays((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val],
    );
  }

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
    fd.append("recurrenceRule", builtRrule);
    if ((endCondition === "ON_DATE" && untilDate) || initial?.recurrenceEndsAt) {
      const endsAtVal = endCondition === "ON_DATE" && untilDate
        ? new Date(untilDate).toISOString()
        : (initial?.recurrenceEndsAt ?? "");
      if (endsAtVal) fd.append("recurrenceEndsAt", endsAtVal);
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

      {/* ── Recurrence builder ── */}
      <div className="space-y-3 rounded-xl border border-border p-4">
        <div>
          <Label htmlFor="recurrence-preset">Recurrence</Label>
          <select
            id="recurrence-preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value as RecurrencePreset)}
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="NONE">Does not repeat</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly (pick days)</option>
            <option value="MONTHLY_DATE">Monthly (same date)</option>
            <option value="MONTHLY_WEEKDAY">Monthly (same weekday)</option>
            <option value="CUSTOM">Custom rrule</option>
          </select>
        </div>

        {preset === "WEEKLY" ? (
          <div>
            <Label>Days of week</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleWeekday(opt.value)}
                  className={cn(
                    "rounded-full border px-3 py-0.5 text-xs transition",
                    weekdays.includes(opt.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {preset === "CUSTOM" ? (
          <div>
            <Label htmlFor="custom-rrule">rrule string (e.g. FREQ=WEEKLY;BYDAY=MO,WE)</Label>
            <Input
              id="custom-rrule"
              value={customRrule}
              onChange={(e) => setCustomRrule(e.target.value)}
              placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
            />
          </div>
        ) : null}

        {preset !== "NONE" ? (
          <div>
            <Label>End condition</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {(["NEVER", "ON_DATE", "AFTER_N"] as EndCondition[]).map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="end-condition"
                    value={c}
                    checked={endCondition === c}
                    onChange={() => setEndCondition(c)}
                  />
                  {c === "NEVER" ? "Never" : c === "ON_DATE" ? "On date" : "After N occurrences"}
                </label>
              ))}
            </div>
            {endCondition === "ON_DATE" ? (
              <Input
                type="datetime-local"
                className="mt-2"
                value={untilDate}
                onChange={(e) => setUntilDate(e.target.value)}
              />
            ) : null}
            {endCondition === "AFTER_N" ? (
              <Input
                type="number"
                min={1}
                max={999}
                className="mt-2 w-28"
                value={countN}
                onChange={(e) => setCountN(e.target.value)}
                placeholder="10"
              />
            ) : null}
          </div>
        ) : null}

        {rruleText ? (
          <p className="text-xs text-muted-foreground italic">
            {rruleText.charAt(0).toUpperCase() + rruleText.slice(1)}
          </p>
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
