/**
 * POST /api/super-admin/invoices
 * Body: { action: "markPaid" | "markVoid", invoiceId }
 * Super-admin only.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSuperAdmin } from "@/server/super-admin";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isSuperAdmin(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { action: string; invoiceId: string };
  const { action, invoiceId } = body;

  if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

  if (action === "markPaid") {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: "PAID", paidAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "markVoid") {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: "VOID" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
