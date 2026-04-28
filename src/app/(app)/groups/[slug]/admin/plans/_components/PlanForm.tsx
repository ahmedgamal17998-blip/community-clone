"use client";

import { useState, useTransition } from "react";
import { createPlanAction } from "@/server/actions/subscription";

export function PlanForm({ groupId }: { groupId: string }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [priceUsd, setPriceUsd] = useState(29);
  const [description, setDescription] = useState("");

  const submit = () => {
    if (!name) return;
    startTransition(async () => {
      await createPlanAction({
        groupId,
        name,
        description,
        durationDays: days,
        priceCents: Math.round(priceUsd * 100),
        currency: "usd",
        active: true,
      });
      setName("");
      setDescription("");
    });
  };

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
      <input
        type="text"
        placeholder="Plan name (e.g. Monthly)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      />
      <input
        type="number"
        min={1}
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        placeholder="days"
        className="w-24 rounded-md border bg-background px-3 py-2 text-sm"
      />
      <input
        type="number"
        min={0}
        step={0.01}
        value={priceUsd}
        onChange={(e) => setPriceUsd(Number(e.target.value))}
        placeholder="USD"
        className="w-28 rounded-md border bg-background px-3 py-2 text-sm"
      />
      <button
        onClick={submit}
        disabled={pending || !name}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Create"}
      </button>
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="md:col-span-4 rounded-md border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}
