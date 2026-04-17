"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Attached = {
  url: string;
  mediaType: "image" | "audio" | "file";
  name?: string;
};

type Props = {
  value: Attached | null;
  onChange: (next: Attached | null) => void;
};

export function MediaAttach({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/chat/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Upload failed");
        return;
      }
      const data = (await res.json()) as {
        url: string;
        mediaType: "image" | "audio" | "file";
      };
      onChange({ url: data.url, mediaType: data.mediaType, name: file.name });
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,audio/*,*/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Attach file"
        title="Attach"
      >
        <Paperclip className="h-4 w-4" />
      </Button>
      {uploading ? (
        <span className="text-xs text-muted-foreground">Uploading…</span>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      {value ? (
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs">
          {value.mediaType === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <span className="truncate max-w-[140px]">{value.name ?? value.mediaType}</span>
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove attachment"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
