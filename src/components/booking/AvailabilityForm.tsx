"use client";

import { useState, useTransition } from "react";
import { updateAvailabilityAction } from "@/server/booking-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Rule = { weekday: number; startMin: number; endMin: number };

type Initial = {
  timezone: string;
  slotLengthMin: number;
  bufferMin: number;
  minNoticeHours: number;
  maxPerDay: number;
  bookableScope: "EVERYONE" | "CONTRIBUTORS" | "ADMINS";
  rules: Rule[];
} | null;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minToHHMM(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
}
function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map((x) => Number(x) || 0);
  return h * 60 + m;
}

export function AvailabilityForm({ initial }: { initial: Initial }) {
  const [timezone, setTimezone] = useState(
    initial?.timezone ??
      (typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC"),
  );
  const [slotLengthMin, setSlotLengthMin] = useState(initial?.slotLengthMin ?? 30);
  const [bufferMin, setBufferMin] = useState(initial?.bufferMin ?? 0);
  const [minNoticeHours, setMinNoticeHours] = useState(initial?.minNoticeHours ?? 4);
  const [maxPerDay, setMaxPerDay] = useState(initial?.maxPerDay ?? 6);
  const [bookableScope, setBookableScope] = useState<"EVERYONE" | "CONTRIBUTORS" | "ADMINS">(
    initial?.bookableScope ?? "EVERYONE",
  );
  const [rules, setRules] = useState<Rule[]>(
    initial?.rules && initial.rules.length > 0
      ? initial.rules
      : // Sensible default: Mon–Fri, 9:00–17:00
        [1, 2, 3, 4, 5].map((w) => ({ weekday: w, startMin: 9 * 60, endMin: 17 * 60 })),
  );
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function addRule(weekday: number) {
    setRules((prev) => [...prev, { weekday, startMin: 9 * 60, endMin: 17 * 60 }]);
  }
  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }
  function updateRule(index: number, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function onSubmit(fd: FormData) {
    fd.set("timezone", timezone);
    fd.set("slotLengthMin", String(slotLengthMin));
    fd.set("bufferMin", String(bufferMin));
    fd.set("minNoticeHours", String(minNoticeHours));
    fd.set("maxPerDay", String(maxPerDay));
    fd.set("bookableScope", bookableScope);
    fd.set("rules", JSON.stringify(rules));
    startTransition(async () => {
      const res = await updateAvailabilityAction(fd);
      if (res?.ok) setStatus("Saved.");
      else setStatus(res?.error ?? "Failed to save.");
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. Africa/Cairo"
          />
        </div>
        <div>
          <Label htmlFor="slot">Slot length (min)</Label>
          <Input
            id="slot"
            type="number"
            min={15}
            max={180}
            value={slotLengthMin}
            onChange={(e) => setSlotLengthMin(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="buf">Buffer between slots (min)</Label>
          <Input
            id="buf"
            type="number"
            min={0}
            max={60}
            value={bufferMin}
            onChange={(e) => setBufferMin(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="notice">Min notice (hours)</Label>
          <Input
            id="notice"
            type="number"
            min={0}
            max={168}
            value={minNoticeHours}
            onChange={(e) => setMinNoticeHours(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="maxday">Max bookings per day</Label>
          <Input
            id="maxday"
            type="number"
            min={1}
            max={24}
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="scope">Who can book you</Label>
          <select
            id="scope"
            value={bookableScope}
            onChange={(e) => setBookableScope(e.target.value as "EVERYONE" | "CONTRIBUTORS" | "ADMINS")}
            className="mt-1 block h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="EVERYONE">Everyone</option>
            <option value="CONTRIBUTORS">Contributors+</option>
            <option value="ADMINS">Admins only</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-3 text-sm font-semibold">Weekly hours</h2>
        <div className="space-y-3">
          {DAY_NAMES.map((day, dIdx) => {
            const dayRules = rules
              .map((r, i) => ({ r, i }))
              .filter((x) => x.r.weekday === dIdx);
            return (
              <div
                key={day}
                className="flex flex-wrap items-center gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="w-12 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {day}
                </div>
                <div className="flex-1 space-y-2">
                  {dayRules.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Unavailable</div>
                  ) : (
                    dayRules.map(({ r, i }) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={minToHHMM(r.startMin)}
                          onChange={(e) =>
                            updateRule(i, { startMin: hhmmToMin(e.target.value) })
                          }
                          className="w-28"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                          type="time"
                          value={minToHHMM(r.endMin)}
                          onChange={(e) =>
                            updateRule(i, { endMin: hhmmToMin(e.target.value) })
                          }
                          className="w-28"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRule(i)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addRule(dIdx)}>
                  + Add
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save availability"}
        </Button>
        {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
      </div>
    </form>
  );
}
