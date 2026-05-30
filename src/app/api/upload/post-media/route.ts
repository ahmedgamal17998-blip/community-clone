/**
 * Unified media upload for posts — images, videos, and files.
 * Uses Vercel Blob for storage.
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/auth";

const LIMITS: Record<string, number> = {
  image: 8 * 1024 * 1024,    // 8 MB
  video: 100 * 1024 * 1024,  // 100 MB
  file: 25 * 1024 * 1024,    // 25 MB
};

function getMediaKind(mimeType: string): "image" | "video" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Blob storage not configured" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  const kind = getMediaKind(mimeType);
  const limit = LIMITS[kind] ?? LIMITS.file;

  if (file.size > limit) {
    return NextResponse.json(
      { error: `File too large (max ${Math.round(limit / 1024 / 1024)} MB for ${kind}s)` },
      { status: 413 },
    );
  }

  const originalName =
    (file as File & { name?: string }).name ?? `upload-${Date.now()}`;
  const folderMap = { image: "post-images", video: "post-videos", file: "post-files" };
  const folder = folderMap[kind];
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const pathname = `${folder}/${session.user.id}/${Date.now()}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "public",
    token,
    contentType: mimeType,
  });

  return NextResponse.json({
    url: blob.url,
    kind,
    name: originalName,
    size: file.size,
    mimeType,
  });
}
