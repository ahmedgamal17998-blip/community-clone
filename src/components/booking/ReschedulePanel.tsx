"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescheduleBookingAction } from "@/server/booking-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type SlotStr = { startsAt: string; endsAt: string };

export function ReschedulePanel({
  bookingId,
  currentTitle,
  currentDescription,
  slots,
  hostHandle: _hostHandle,
}: {
  bookingId: string;
  currentTitle: string;
  currentDescription: string;
  slots: SlotStr[];
  hostHandle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SlotStr | null>(null);
  const [title, setTitle] = useState(currentTitle);
  const [description, setDescription] = useState(currentDescription);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, SlotStr[]>();
    for (const s of slots) {
      const d = new Date(s.startsAt);
      const key = d.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  function onConfirm() {
    if (!selected) return;
    setError(null);
    const fd = new FormData();
    fd.set("bookingId", bookingId);
    fd.set("startsAt", selected.startsAt);
    fd.set("endsAt", selected.endsAt);
    fd.set("title", title);
    fd.set("description", description);
    startTransition(async () => {
      const res = await rescheduleBookingAction(fd);
      if (res?.ok) {
        router.push(`/bookings/${res.newBookingId}?rescheduled=1`);
      } else {
        setError(res?.error ?? "Failed to reschedule");
      }
    });
  }

  if (!open) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Need a different time?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pick a new slot to reschedule this booking.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Reschedule
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Reschedule booking</h3>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => { setOpen(false); setSelected(null); setError(null); }}
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-72 overflow-y-auto">
        {byDay.map(([day, items]) => {
          const d = new Date(day + "T00:00:00Z");
          return (
            <div key={day} className="rounded-lg border border-border bg-background p-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {d.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex flex-col gap-1">
                {items.map((s) => {
                  const isSel =
                    selected?.startsAt === s.startsAt &&
                    selected?.endsAt === s.endsAt;
                  return (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => setSelected(s)}
                      className={`rounded px-2 py-0.5 text-xs transition border ${
                        isSel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary"
                      }`}
                    >
                      {new Date(s.startsAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected ? (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            New time: {new Date(selected.startsAt).toLocaleString()} →{" "}
            {new Date(selected.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <div>
            <Label htmlFor="r-title">Title</Label>
            <Input
              id="r-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="r-desc">Description</Label>
            <Textarea
              id="r-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <Button onClick={onConfirm} disabled={pending} className="w-full">
            {pending ? "Rescheduling…" : "Confirm reschedule"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Select a new time above to continue.</p>
      )}
    </div>
  );
}
