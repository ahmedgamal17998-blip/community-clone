import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function mediaTypeFor(mime: string): "image" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "NO_FILE" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
  }

  const name = (file as File).name ?? `upload-${Date.now()}`;
  const mime = (file as File).type || "application/octet-stream";

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Dev fallback: return a data URL so the UI at least works without blob.
    const buf = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    return NextResponse.json({ url: dataUrl, mediaType: mediaTypeFor(mime) });
  }

  const key = `chat/${session.user.id}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const blob = await put(key, file, {
    access: "public",
    contentType: mime,
  });
  return NextResponse.json({
    url: blob.url,
    mediaType: mediaTypeFor(mime),
  });
}
