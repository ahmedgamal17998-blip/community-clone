/**
 * M24: Per-user image upload for posts/comments. Members can upload
 * directly from their device.
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/auth";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

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
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 413 });
  }

  const ext = file.type.split("/")[1]?.split(";")[0] || "png";
  const pathname = `post-images/${session.user.id}/${Date.now()}.${ext}`;

  const blob = await put(pathname, file, {
    access: "public",
    token,
    contentType: file.type || "image/png",
  });

  return NextResponse.json({ url: blob.url });
}
