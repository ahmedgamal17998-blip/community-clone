"use client";

import { useTransition, useState } from "react";
import { grantAccessAction, revokeAccessAction } from "@/server/actions/access";
import type { ResourceType } from "@/server/access";

type Resource = { id: string; name: string; slug: string; kind?: string };
type Course = { id: string; title: string; slug: string };
type Access = {
  resourceType: string;
  resourceId: string;
  expiresAt: Date | null;
};

export function AccessMatrix({
  groupId,
  userId,
  channels,
  courses,
  accesses,
}: {
  groupId: string;
  userId: string;
  channels: Resource[];
  courses: Course[];
  accesses: Access[];
}) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(accesses);

  const isGranted = (type: ResourceType, id: string) =>
    local.some(
      (a) =>
        a.resourceType === type &&
        a.resourceId === id &&
        (!a.expiresAt || new Date(a.expiresAt) > new Date()),
    );

  const expiryOf = (type: ResourceType, id: string) =>
    local.find((a) => a.resourceType === type && a.resourceId === id)?.expiresAt;

  const toggle = (type: ResourceType, id: string, granted: boolean) => {
    startTransition(async () => {
      if (granted) {
        await revokeAccessAction({
          groupId,
          userId,
          resourceType: type,
          resourceId: id,
        });
        setLocal((p) => p.filter((a) => !(a.resourceType === type && a.resourceId === id)));
      } else {
        await grantAccessAction({
          groupId,
          userId,
          resourceType: type,
          resourceId: id,
          expiresAt: null,
        });
        setLocal((p) => [
          ...p.filter((a) => !(a.resourceType === type && a.resourceId === id)),
          { resourceType: type, resourceId: id, expiresAt: null },
        ]);
      }
    });
  };

  const setExpiry = (type: ResourceType, id: string, expiresAt: Date | null) => {
    startTransition(async () => {
      await grantAccessAction({
        groupId,
        userId,
        resourceType: type,
        resourceId: id,
        expiresAt,
      });
      setLocal((p) => [
        ...p.filter((a) => !(a.resourceType === type && a.resourceId === id)),
        { resourceType: type, resourceId: id, expiresAt },
      ]);
    });
  };

  const Row = ({
    type,
    id,
    label,
  }: {
    type: ResourceType;
    id: string;
    label: string;
  }) => {
    const granted = isGranted(type, id);
    const exp = expiryOf(type, id);
    const expStr = exp ? new Date(exp).toISOString().slice(0, 10) : "";

    return (
      <tr className="border-t">
        <td className="px-3 py-2 text-sm">{label}</td>
        <td className="px-3 py-2">
          <button
            onClick={() => toggle(type, id, granted)}
            disabled={pending}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              granted
                ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {granted ? "Granted" : "Locked"}
          </button>
        </td>
        <td className="px-3 py-2">
          <input
            type="date"
            disabled={!granted || pending}
            value={expStr}
            onChange={(e) =>
              setExpiry(type, id, e.target.value ? new Date(e.target.value) : null)
            }
            className="rounded-md border bg-background px-2 py-1 text-xs"
          />
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {channels.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Channels
          </h3>
          <table className="w-full">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1">Channel</th>
                <th className="px-3 py-1">Status</th>
                <th className="px-3 py-1">Expires</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <Row key={c.id} type="CHANNEL" id={c.id} label={`#${c.slug}`} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {courses.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Courses
          </h3>
          <table className="w-full">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1">Course</th>
                <th className="px-3 py-1">Status</th>
                <th className="px-3 py-1">Expires</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <Row key={c.id} type="COURSE" id={c.id} label={c.title} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
