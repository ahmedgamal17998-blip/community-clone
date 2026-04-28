"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

/**
 * M24: Multi-image uploader for posts/comments. Uploads to /api/upload/post-image
 * and emits the URL list via onChange. Mobile-friendly: uses native file picker
 * which on mobile shows camera + gallery.
 */
export function ImageUploader({
  value,
  onChange,
  max = 4,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slots = Math.max(0, max - value.length);
    const list = Array.from(files).slice(0, slots);
    const newUrls: string[] = [];
    for (const file of list) {
      setUploading((u) => u + 1);
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/upload/post-image", {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (json.url) newUrls.push(json.url);
      } finally {
        setUploading((u) => u - 1);
      }
    }
    if (newUrls.length > 0) onChange([...value, ...newUrls]);
    if (ref.current) ref.current.value = "";
  };

  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((u, i) => (
            <div
              key={i}
              className="relative h-20 w-20 overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove image"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length < max && (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-xs hover:bg-muted">
          <ImagePlus className="h-4 w-4" />
          {uploading > 0 ? `Uploading ${uploading}…` : "Add image"}
          <input
            ref={ref}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
