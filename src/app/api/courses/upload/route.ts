import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "image"); // "image" | "video"

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "NO_FILE" }, { status: 400 });
  }

  const mime = (file as File).type || "application/octet-stream";
  const isVideo = kind === "video" || mime.startsWith("video/");
  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  if (file.size > limit) {
    return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Do NOT base64-fallback for courses: videos can easily be hundreds of MB.
    // Reject so the operator knows to configure Blob or paste a URL instead.
    // eslint-disable-next-line no-console
    console.warn("[courses/upload] BLOB_READ_WRITE_TOKEN missing; rejecting upload");
    return NextResponse.json(
      { error: "BLOB_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const name = (file as File).name ?? `upload-${Date.now()}`;
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `courses/${session.user.id}/${isVideo ? "videos" : "covers"}/${Date.now()}-${safeName}`;

  const blob = await put(key, file, {
    access: "public",
    contentType: mime,
  });

  return NextResponse.json({ url: blob.url });
}
