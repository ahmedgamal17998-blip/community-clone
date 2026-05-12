"use client";

import { useRef, useState } from "react";
import { Upload, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  name: string;
  defaultValue?: string | null;
};

/**
 * Lesson video field.
 *
 * UX is "URL first, upload as fallback":
 *   - The big input is the URL paste field (recommended path — keeps lesson
 *     videos on a CDN you don't pay storage for, like YouTube / Vimeo).
 *   - A smaller "Upload MP4/WebM" button below is available for admins who
 *     don't have an external host. Uploads go to Vercel Blob and count
 *     against your blob storage quota.
 *
 * Both inputs write to the same hidden `videoUrl` field, so the server side
 * sees a single value either way.
 */
export function VideoUpload({ name, defaultValue }: Props) {
  const [url, setUrl] = useState<string>(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobDisabled, setBlobDisabled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "video");
      const res = await fetch("/api/courses/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j.error === "BLOB_NOT_CONFIGURED") {
          setBlobDisabled(true);
          setError("Video upload is not configured. Paste a URL instead.");
        } else {
          setError(j.error ?? "Upload failed");
        }
        return;
      }
      const data = (await res.json()) as { url: string };
      setUrl(data.url);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="video-url">
        Video
      </label>

      {/* Primary: paste a URL. We label it clearly so admins land here first
          and don't burn blob storage on every lesson. */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Paste a YouTube, Vimeo, MP4 or WebM URL (recommended)
          </span>
        </div>
        <Input
          id="video-url"
          type="url"
          placeholder="https://youtu.be/… or https://vimeo.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      {/* Fallback: upload a file. Quieter UI so it doesn't pull attention from
          the URL field. */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground">
          Or upload a file:
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || blobDisabled}
          className="h-7 text-xs"
        >
          <Upload className="mr-1.5 h-3 w-3" />
          {uploading ? "Uploading…" : "Choose MP4/WebM"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = "";
          }}
        />
        <span className="text-[10px] text-muted-foreground">
          (max 200 MB)
        </span>
      </div>

      <input type="hidden" name={name} value={url} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
