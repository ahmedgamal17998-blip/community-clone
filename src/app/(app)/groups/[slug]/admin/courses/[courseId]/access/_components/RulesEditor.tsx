"use client";

import { useState, useTransition } from "react";
import { addRuleAction, removeRuleAction } from "@/server/actions/course-access";

type Rule = {
  id: string;
  type: string;
  channelId: string | null;
  minRole: string | null;
  tenureDays: number | null;
  priceCents: number | null;
};

export function RulesEditor({
  groupId,
  courseId,
  rules,
  channels,
}: {
  groupId: string;
  courseId: string;
  rules: Rule[];
  channels: { id: string; slug: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"CHANNEL" | "ROLE_LEVEL" | "TENURE" | "PAID">(
    "CHANNEL",
  );
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [minRole, setMinRole] = useState("MEMBER");
  const [tenureDays, setTenureDays] = useState(30);
  const [priceUsd, setPriceUsd] = useState(29);

  const add = () => {
    startTransition(async () => {
      await addRuleAction({
        groupId,
        courseId,
        type,
        channelId: type === "CHANNEL" ? channelId : undefined,
        minRole: type === "ROLE_LEVEL" ? minRole : undefined,
        tenureDays: type === "TENURE" ? tenureDays : undefined,
        priceCents: type === "PAID" ? Math.round(priceUsd * 100) : undefined,
      });
    });
  };

  const remove = (ruleId: string) => {
    startTransition(async () => {
      await removeRuleAction({ groupId, ruleId });
    });
  };

  const ruleLabel = (r: Rule) => {
    switch (r.type) {
      case "CHANNEL":
        return `Channel: #${channels.find((c) => c.id === r.channelId)?.slug ?? r.channelId}`;
      case "ROLE_LEVEL":
        return `Role ≥ ${r.minRole}`;
      case "TENURE":
        return `Active for ${r.tenureDays} days`;
      case "PAID":
        return `Paid: $${((r.priceCents ?? 0) / 100).toFixed(2)}`;
      case "MANUAL":
        return "Manual grants only";
      default:
        return r.type;
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <h2 className="text-sm font-semibold">Access rules</h2>

      <div className="space-y-2">
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rules yet. By default, only enrolled / manually granted users can access.
          </p>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border bg-muted/40 p-2"
            >
              <span className="text-sm">{ruleLabel(r)}</span>
              <button
                onClick={() => remove(r.id)}
                disabled={pending}
                className="text-xs text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Add rule
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={type}
            onChange={(e) =>
              setType(e.target.value as "CHANNEL" | "ROLE_LEVEL" | "TENURE" | "PAID")
            }
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="CHANNEL">Channel access</option>
            <option value="ROLE_LEVEL">Role level</option>
            <option value="TENURE">Tenure (days)</option>
            <option value="PAID">Paid</option>
          </select>

          {type === "CHANNEL" && (
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.slug}
                </option>
              ))}
            </select>
          )}

          {type === "ROLE_LEVEL" && (
            <select
              value={minRole}
              onChange={(e) => setMinRole(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="MEMBER">Member</option>
              <option value="CONTRIBUTOR">Contributor</option>
              <option value="ADMIN">Admin</option>
              <option value="OWNER">Owner</option>
            </select>
          )}

          {type === "TENURE" && (
            <input
              type="number"
              min={1}
              value={tenureDays}
              onChange={(e) => setTenureDays(Number(e.target.value))}
              placeholder="days"
              className="w-24 rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          )}

          {type === "PAID" && (
            <input
              type="number"
              min={0}
              step={0.01}
              value={priceUsd}
              onChange={(e) => setPriceUsd(Number(e.target.value))}
              placeholder="USD"
              className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          )}

          <button
            onClick={add}
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
