"use client";

import { useState } from "react";
import { UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminGrantEnrollmentAction,
  adminRevokeEnrollmentAction,
} from "@/server/stripe-actions";

type EnrollmentRow = {
  id: string;
  userId: string;
  status: string;
  enrolledAt: Date;
  stripeSessionId: string | null;
  amountPaid: number | null;
  currency: string | null;
  user: { name: string | null; email: string | null; handle: string };
};

type Props = {
  courseId: string;
  enrollments: EnrollmentRow[];
};

export function AdminEnrollmentPanel({ courseId, enrollments: initial }: Props) {
  const [rows, setRows] = useState(initial);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantUserId, setGrantUserId] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  async function handleGrant() {
    if (!grantUserId.trim()) return;
    setGrantLoading(true);
    setGrantError(null);
    try {
      const fd = new FormData();
      fd.set("courseId", courseId);
      fd.set("userId", grantUserId.trim());
      const result = await adminGrantEnrollmentAction(fd);
      if (result.ok) {
        setGrantUserId("");
        setGrantEmail("");
      } else {
        setGrantError(result.error);
      }
    } catch {
      setGrantError("Something went wrong.");
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleRevoke(enrollmentId: string) {
    const fd = new FormData();
    fd.set("enrollmentId", enrollmentId);
    const result = await adminRevokeEnrollmentAction(fd);
    if (result.ok) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === enrollmentId ? { ...r, status: "REFUNDED" } : r,
        ),
      );
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Enrollment Management</h3>

      {/* Grant free access */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Grant free access (by User ID)</Label>
        <div className="flex gap-2">
          <Input
            value={grantUserId}
            onChange={(e) => setGrantUserId(e.target.value)}
            placeholder="User ID (cuid)"
            className="text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleGrant}
            disabled={grantLoading || !grantUserId.trim()}
          >
            <UserCheck className="mr-1 h-4 w-4" />
            Grant
          </Button>
        </div>
        {grantError && <p className="text-xs text-destructive">{grantError}</p>}
      </div>

      {/* Enrollment list */}
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No enrollments yet.</p>
      ) : (
        <div className="divide-y divide-border text-xs">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">
                  {r.user.name ?? r.user.handle}
                  {r.user.email ? (
                    <span className="ml-1 text-muted-foreground">({r.user.email})</span>
                  ) : null}
                </p>
                <p className="text-muted-foreground">
                  {new Date(r.enrolledAt).toLocaleDateString()}
                  {r.amountPaid != null
                    ? ` · ${(r.amountPaid / 100).toFixed(2)} ${(r.currency ?? "usd").toUpperCase()}`
                    : " · Free grant"}
                  {r.stripeSessionId ? (
                    <span className="ml-1 font-mono">{r.stripeSessionId.slice(-8)}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    r.status === "ACTIVE"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {r.status}
                </span>
                {r.status === "ACTIVE" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleRevoke(r.id)}
                  >
                    <UserX className="mr-1 h-3 w-3" />
                    Revoke
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
