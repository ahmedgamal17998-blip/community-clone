"use client";

import { useState, useTransition, useRef } from "react";
import { setFaviconAction } from "../actions";

export function FaviconUploader({
  groupId,
  initialUrl,
}: {
  groupId: string;
  initialUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("groupId", groupId);
      fd.set("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json.url) setUrl(json.url);
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await setFaviconAction({ groupId, faviconUrl: url || null });
      setSaved(true);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-12 w-12 rounded border object-cover"
          />
        )}
        <input
          ref={ref}
          type="file"
          accept="image/png,image/x-icon,image/svg+xml"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="text-sm"
        />
        {uploading && <span className="text-xs">Uploading…</span>}
      </div>

      <input
        type="url"
        placeholder="…or paste URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save favicon"}
        </button>
        {saved && <span className="text-xs text-green-600">Saved ✓</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Recommended: 32×32 or 64×64 PNG / ICO / SVG. Replaces the browser tab icon
        when members are inside this group.
      </p>
    </div>
  );
}
