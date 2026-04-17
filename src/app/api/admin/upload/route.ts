/**
 * Admin-panel image upload (logo / cover).
 * Auth: ACTIVE ADMIN+ of the `groupId` form field.
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
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

  const groupId = form.get("groupId");
  if (typeof groupId !== "string" || !groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }

  const me = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: session.user.id } },
    select: { role: true, state: true },
  });
  if (!me || me.state !== "ACTIVE" || !hasMinRole(me.role as Role, "ADMIN")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }

  const ext = file.type.split("/")[1]?.split(";")[0] || "png";
  const pathname = `group-branding/${groupId}/${Date.now()}.${ext}`;

  const blob = await put(pathname, file, {
    access: "public",
    token,
    contentType: file.type || "image/png",
  });

  return NextResponse.json({ url: blob.url });
}
