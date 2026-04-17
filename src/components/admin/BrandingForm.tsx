"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ColorPicker } from "@/components/admin/ColorPicker";
import { updateGroupBrandingAction } from "@/server/admin-actions";

type Props = {
  groupId: string;
  initial: {
    logoUrl: string | null;
    coverUrl: string | null;
    primaryHsl: string;
    name: string;
  };
};

async function uploadImage(file: File, groupId: string): Promise<string> {
  const fd = new FormData();
  fd.set("groupId", groupId);
  fd.set("file", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Upload failed");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

export function BrandingForm({ groupId, initial }: Props) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [coverUrl, setCoverUrl] = useState(initial.coverUrl ?? "");
  const [primaryHsl, setPrimaryHsl] = useState(initial.primaryHsl);
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(kind: "logo" | "cover", file: File | null) {
    if (!file) return;
    try {
      const url = await uploadImage(file, groupId);
      if (kind === "logo") setLogoUrl(url);
      else setCoverUrl(url);
    } catch (e: unknown) {
      setMsg((e as Error).message);
    }
  }

  function save() {
    const fd = new FormData();
    fd.set("groupId", groupId);
    fd.set("logoUrl", logoUrl);
    fd.set("coverUrl", coverUrl);
    fd.set("primaryHsl", primaryHsl);
    startTransition(async () => {
      const res = await updateGroupBrandingAction(fd);
      if (res?.ok) {
        setMsg("Saved.");
        router.refresh();
      } else {
        setMsg(res?.error ?? "Failed");
      }
    });
  }

  const previewCss = (() => {
    const m = primaryHsl.match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
    return m ? `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)` : "#6d56f0";
  })();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Logo</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFile("logo", e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
          <input
            type="text"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Cover</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFile("cover", e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
          <input
            type="text"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Primary color</label>
          <ColorPicker value={primaryHsl} onChange={setPrimaryHsl} />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save branding"}
          </button>
          {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
        </div>
      </div>

      <aside className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Live preview
        </div>
        <div
          className="h-24 w-full rounded-md"
          style={{
            backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: previewCss,
          }}
        />
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-12 w-12 overflow-hidden rounded-full border border-border"
            style={{ backgroundColor: previewCss }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div>
            <div className="text-sm font-semibold">{initial.name}</div>
            <button
              type="button"
              className="mt-1 rounded-md px-2 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: previewCss }}
            >
              Primary button
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
