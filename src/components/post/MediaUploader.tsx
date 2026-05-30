"use client";

import { useRef, useState } from "react";
import { ImagePlus, Film, FileUp, X, FileText, Music } from "lucide-react";
import type { MediaFile } from "@/server/posts";

export type UploadedMedia = {
  images: string[];
  videos: string[];
  files: MediaFile[];
};

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("video/")) return <Film className="h-5 w-5 text-muted-foreground" />;
  if (mimeType.startsWith("audio/")) return <Music className="h-5 w-5 text-muted-foreground" />;
  return <FileText className="h-5 w-5 text-muted-foreground" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaUploader({
  value,
  onChange,
  maxImages = 4,
}: {
  value: UploadedMedia;
  onChange: (next: UploadedMedia) => void;
  maxImages?: number;
}) {
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function uploadOne(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/upload/post-media", { method: "POST", body: fd });
    const json = (await res.json()) as { url?: string; kind?: string; name?: string; size?: number; mimeType?: string; error?: string };
    if (!res.ok || !json.url) {
      setError(json.error ?? "Upload failed");
      return null;
    }
    return json as { url: string; kind: string; name: string; size: number; mimeType: string };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = Array.from(files);
    setUploading((u) => u + list.length);
    const results = await Promise.all(list.map(uploadOne));
    setUploading((u) => u - list.length);

    const next = { ...value };
    for (const r of results) {
      if (!r) continue;
      if (r.kind === "image") next.images = [...next.images, r.url];
      else if (r.kind === "video") next.videos = [...next.videos, r.url];
      else next.files = [...next.files, { url: r.url, name: r.name, size: r.size, mimeType: r.mimeType }];
    }
    onChange(next);
    if (imageRef.current) imageRef.current.value = "";
    if (videoRef.current) videoRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      {/* Image thumbnails */}
      {value.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.images.map((u, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange({ ...value, images: value.images.filter((_, j) => j !== i) })}
                aria-label="Remove image"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Video previews */}
      {value.videos.map((u, i) => (
        <div key={i} className="relative overflow-hidden rounded-lg border bg-muted">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={u} controls className="max-h-48 w-full" />
          <button
            type="button"
            onClick={() => onChange({ ...value, videos: value.videos.filter((_, j) => j !== i) })}
            aria-label="Remove video"
            className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {/* File list */}
      {value.files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <FileIcon mimeType={f.mimeType} />
          <span className="flex-1 truncate text-sm">{f.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
          <button
            type="button"
            onClick={() => onChange({ ...value, files: value.files.filter((_, j) => j !== i) })}
            aria-label="Remove file"
            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Upload trigger buttons */}
      <div className="flex flex-wrap gap-2">
        {value.images.length < maxImages && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs hover:bg-muted">
            <ImagePlus className="h-3.5 w-3.5" />
            Photos
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
          </label>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs hover:bg-muted">
          <Film className="h-3.5 w-3.5" />
          Video
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs hover:bg-muted">
          <FileUp className="h-3.5 w-3.5" />
          File
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </label>
      </div>

      {uploading > 0 && (
        <p className="text-xs text-muted-foreground">
          Uploading {uploading} file{uploading > 1 ? "s" : ""}…
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
