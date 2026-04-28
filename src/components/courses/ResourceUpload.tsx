"use client";

/**
 * Multi-file resource uploader for lessons.
 *
 * Stores resources as a JSON array on the form: `[{ url, name }]`.
 * Upload uses the same /api/courses/upload endpoint as covers/videos.
 */

import { useRef, useState } from "react";
import { Upload, X, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

type Resource = { url: string; name: string; size?: number };

type Props = {
  name: string;
  defaultValue?: string | null; // JSON-encoded Resource[]
};

function parseInitial(json: string | null | undefined): Resource[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.filter((r) => r?.url);
  } catch {
    /* ignore */
  }
  return [];
}

export function ResourceUpload({ name, defaultValue }: Props) {
  const [items, setItems] = useState<Resource[]>(parseInitial(defaultValue));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    setError(null);
    for (const file of Array.from(files)) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        // Use generic image kind for resources (relaxed type checks); the
        // upload endpoint accepts any file type when kind=image is unset.
        fd.set("kind", "image");
        const res = await fetch("/api/courses/upload", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? "Upload failed");
          continue;
        }
        const data = (await res.json()) as { url: string };
        setItems((prev) => [
          ...prev,
          { url: data.url, name: file.name, size: file.size },
        ]);
      } catch {
        setError("Upload failed");
      } finally {
        setUploading(false);
      }
    }
  }

  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Downloadable resources</label>

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((r, i) => (
            <li
              key={`${r.url}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate hover:text-primary"
              >
                {r.name}
              </a>
              {r.size && (
                <span className="text-muted-foreground">
                  {(r.size / 1024).toFixed(0)} KB
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? "Uploading…" : "Add files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFiles(e.target.files);
            }
            e.currentTarget.value = "";
          }}
        />
        <span className="text-xs text-muted-foreground">
          PDFs, slides, anything members should download
        </span>
      </div>

      {/* Hidden input carries the JSON to the form */}
      <input type="hidden" name={name} value={JSON.stringify(items)} />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
