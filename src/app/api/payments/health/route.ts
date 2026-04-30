/**
 * Health check for the external payment-system connection. Calls the
 * /health endpoint on the configured PAYMENT_SYSTEM_URL with the admin
 * API key and reports whether it's reachable.
 *
 * Auth: any authenticated user (the panel is admin-gated upstream).
 */
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const baseUrl = process.env.PAYMENT_SYSTEM_URL?.replace(/\/$/, "");
  const adminKey = process.env.PAYMENT_SYSTEM_ADMIN_KEY;
  if (!baseUrl || !adminKey) {
    return NextResponse.json({
      ok: false,
      error: "PAYMENT_SYSTEM_NOT_CONFIGURED",
    });
  }

  try {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { "x-admin-key": adminKey },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
