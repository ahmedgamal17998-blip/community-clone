"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBookingAction } from "@/server/booking-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type SlotStr = { startsAt: string; endsAt: string };

export function GuestBookingPicker({
  hostHandle,
  hostName,
  slots,
  groupId,
  prefillEmail,
  prefillName,
}: {
  hostHandle: string;
  hostName: string;
  slots: SlotStr[];
  groupId: string | null;
  prefillEmail: string;
  prefillName: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<SlotStr | null>(null);
  const [title, setTitle] = useState(`Chat with ${hostName}`);
  const [description, setDescription] = useState("");
  const [guestEmail, setGuestEmail] = useState(prefillEmail);
  const [guestName, setGuestName] = useState(prefillName);
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
    if (!guestEmail.trim()) {
      setError("Email is required");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("hostHandle", hostHandle);
    fd.set("startsAt", selected.startsAt);
    fd.set("endsAt", selected.endsAt);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("guestEmail", guestEmail.trim());
    fd.set("guestName", guestName.trim());
    if (groupId) fd.set("groupId", groupId);
    startTransition(async () => {
      const res = await createBookingAction(fd);
      if (res?.ok) {
        if ("guestToken" in res && res.guestToken) {
          router.push(
            `/profile/${hostHandle}/book/confirm?bookingId=${res.bookingId}&token=${res.guestToken}`,
          );
        } else {
          router.push(`/bookings/${res.bookingId}`);
        }
      } else {
        setError(res?.error ?? "Failed to book");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {byDay.map(([day, items]) => {
          const d = new Date(day + "T00:00:00Z");
          return (
            <div key={day} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {d.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex flex-col gap-2">
                {items.map((s) => {
                  const isSel =
                    selected?.startsAt === s.startsAt &&
                    selected?.endsAt === s.endsAt;
                  return (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => setSelected(s)}
                      className={`rounded-md border px-2 py-1 text-sm transition ${
                        isSel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary"
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

      <aside className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
        <h2 className="text-sm font-semibold">Your booking</h2>

        {/* Guest identity fields — always shown */}
        <div className="mt-3 space-y-3 border-b border-border pb-3">
          <div>
            <Label htmlFor="g-name">Your name</Label>
            <Input
              id="g-name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <Label htmlFor="g-email">Your email <span className="text-destructive">*</span></Label>
            <Input
              id="g-email"
              type="email"
              required
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
        </div>

        {selected ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              {new Date(selected.startsAt).toLocaleString()} →{" "}
              {new Date(selected.endsAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="g-title">Title</Label>
                <Input
                  id="g-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="g-desc">Description</Label>
                <Textarea
                  id="g-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="What would you like to discuss?"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <Button onClick={onConfirm} disabled={pending} className="w-full">
                {pending ? "Booking…" : "Confirm booking"}
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Pick a time from the grid to continue.
          </p>
        )}
      </aside>
    </div>
  );
}
