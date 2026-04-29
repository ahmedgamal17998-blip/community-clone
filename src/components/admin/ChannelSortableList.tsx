"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  reorderChannelsAction,
  setChannelKindAction,
  setChannelTierAction,
  toggleChannelArchiveAction,
} from "@/server/admin-actions";

type Channel = {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  kind: string;
  tier: string;
  archived: boolean;
  position: number;
};

type Props = { groupId: string; channels: Channel[] };

function SortableRow({
  channel,
  onKind,
  onTier,
  onArchive,
}: {
  channel: Channel;
  onKind: (id: string, kind: string) => void;
  onTier: (id: string, tier: "FREE" | "PREMIUM") => void;
  onArchive: (id: string, archived: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 border-b border-border p-3 last:border-0"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab select-none rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        ⋮⋮
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium">
          {channel.emoji ? `${channel.emoji} ` : ""}
          {channel.name}
        </div>
        <div className="text-xs text-muted-foreground">#{channel.slug}</div>
      </div>
      <select
        value={channel.kind}
        onChange={(e) => onKind(channel.id, e.target.value)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      >
        <option value="PUBLIC">PUBLIC</option>
        <option value="PRIVATE">PRIVATE</option>
        <option value="ANNOUNCEMENT">ANNOUNCEMENT</option>
      </select>
      {/* Tier toggle: FREE / PREMIUM */}
      <button
        type="button"
        onClick={() =>
          onTier(channel.id, channel.tier === "PREMIUM" ? "FREE" : "PREMIUM")
        }
        className={
          channel.tier === "PREMIUM"
            ? "h-8 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-xs font-bold text-amber-700 hover:border-amber-500 dark:text-amber-400"
            : "h-8 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:border-primary"
        }
        title={
          channel.tier === "PREMIUM"
            ? "Click to make this channel free for everyone"
            : "Click to make this channel premium (gated by plan)"
        }
      >
        {channel.tier === "PREMIUM" ? "PREMIUM" : "FREE"}
      </button>
      <button
        type="button"
        onClick={() => onArchive(channel.id, !channel.archived)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs hover:border-primary"
      >
        {channel.archived ? "Unarchive" : "Archive"}
      </button>
    </div>
  );
}

export function ChannelSortableList({ groupId, channels: initial }: Props) {
  const router = useRouter();
  const [channels, setChannels] = useState(initial);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = channels.findIndex((c) => c.id === active.id);
    const newIdx = channels.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(channels, oldIdx, newIdx).map((c, i) => ({
      ...c,
      position: i,
    }));
    setChannels(next);

    const fd = new FormData();
    fd.set("groupId", groupId);
    fd.set(
      "items",
      JSON.stringify(next.map((c) => ({ channelId: c.id, position: c.position }))),
    );
    startTransition(async () => {
      await reorderChannelsAction(fd);
    });
  }

  function onKind(id: string, kind: string) {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, kind } : c)));
    const fd = new FormData();
    fd.set("channelId", id);
    fd.set("kind", kind);
    startTransition(async () => {
      await setChannelKindAction(fd);
      router.refresh();
    });
  }

  function onTier(id: string, tier: "FREE" | "PREMIUM") {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, tier } : c)));
    const fd = new FormData();
    fd.set("channelId", id);
    fd.set("tier", tier);
    startTransition(async () => {
      await setChannelTierAction(fd);
      router.refresh();
    });
  }

  function onArchive(id: string, archived: boolean) {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, archived } : c)),
    );
    const fd = new FormData();
    fd.set("channelId", id);
    fd.set("archived", archived ? "1" : "0");
    startTransition(async () => {
      await toggleChannelArchiveAction(fd);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={channels.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {channels.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No channels yet.
            </div>
          ) : (
            channels.map((c) => (
              <SortableRow
                key={c.id}
                channel={c}
                onKind={onKind}
                onTier={onTier}
                onArchive={onArchive}
              />
            ))
          )}
        </SortableContext>
      </DndContext>
    </div>
  );
}
