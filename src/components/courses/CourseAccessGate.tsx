"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCheckoutSessionAction } from "@/server/stripe-actions";

type Props = {
  course: {
    id: string;
    priceType: string;
    priceAmount: number | null;
    currency: string;
  };
  enrolled: boolean;
  stripeConfigured: boolean;
  children?: React.ReactNode;
};

export function CourseAccessGate({ course, enrolled, stripeConfigured, children }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFree = course.priceType === "FREE";
  const canAccess = isFree || enrolled;

  if (canAccess) {
    return (
      <div className="space-y-3">
        {enrolled && !isFree && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Enrolled
          </div>
        )}
        {children}
      </div>
    );
  }

  // PAID + NOT enrolled
  const priceDisplay =
    course.priceAmount != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: course.currency ?? "usd",
        }).format(course.priceAmount / 100)
      : null;

  async function handleEnroll() {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("courseId", course.id);
      const result = await createCheckoutSessionAction(fd);
      if (result.ok) {
        router.push(result.url);
      } else {
        setError(result.error);
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/60 p-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-base font-semibold">Paid Course</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {priceDisplay
          ? `Enroll for ${priceDisplay} to access all lessons.`
          : "Enroll to access all lessons."}
      </p>

      {stripeConfigured ? (
        <div className="space-y-2">
          <Button
            onClick={handleEnroll}
            disabled={loading}
            className="w-full"
          >
            {loading
              ? "Redirecting…"
              : priceDisplay
              ? `Enroll — ${priceDisplay}`
              : "Enroll now"}
          </Button>
          {error && (
            <p className="text-xs text-destructive">
              {error === "already_enrolled"
                ? "You are already enrolled."
                : error === "not_a_member"
                ? "You must be a group member to enroll."
                : error === "price_not_set"
                ? "This course doesn't have a price set yet."
                : "Payment failed. Please try again."}
            </p>
          )}
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <Lock className="h-3 w-3" />
          Payment coming soon
        </span>
      )}
    </div>
  );
}
