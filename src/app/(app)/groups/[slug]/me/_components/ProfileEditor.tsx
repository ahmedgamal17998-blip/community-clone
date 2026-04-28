"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/server/actions/subscription";

export function ProfileEditor({
  initialName,
  initialBio,
  initialImage,
}: {
  initialName: string;
  initialBio: string;
  initialImage: string;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [image, setImage] = useState(initialImage);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await updateProfileAction({ name, bio, image });
      setSaved(true);
    });
  };

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h2 className="mb-4 text-sm font-semibold">Edit profile</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Profile photo URL
          </label>
          <input
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save profile"}
          </button>
          {saved && (
            <span className="text-xs text-green-600">Saved ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
