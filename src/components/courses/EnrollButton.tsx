"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createFreeEnrollmentAction } from "@/server/enrollment";

type Props = {
  courseId: string;
  groupId: string;
  courseSlug: string;
  groupSlug: string;
  priceLabel?: string | null;
  priceType: string; // "FREE" | "PAID"
};

export function EnrollButton({
  courseId,
  groupId,
  courseSlug,
  groupSlug,
  priceLabel,
  priceType,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (priceType === "FREE") {
    async function handleFreeEnroll() {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("courseId", courseId);
        const result = await createFreeEnrollmentAction(fd);
        if (result.ok) {
          router.push(
            `/groups/${groupSlug}/learning/${courseSlug}?enrolled=1`,
          );
          router.refresh();
        }
      });
    }

    return (
      <Button onClick={handleFreeEnroll} disabled={isPending} className="w-full">
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enrolling…
          </>
        ) : (
          "Enroll for free"
        )}
      </Button>
    );
  }

  // PAID — call checkout API, then redirect to Stripe.
  async function handlePaidEnroll() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (data.url) {
          window.location.href = data.url;
        }
      } catch {
        // Silently fail — CourseAccessGate has its own error handling.
      }
    });
  }

  return (
    <Button onClick={handlePaidEnroll} disabled={isPending} className="w-full">
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Redirecting to checkout…
        </>
      ) : priceLabel ? (
        `Enroll — ${priceLabel}`
      ) : (
        "Enroll now"
      )}
    </Button>
  );
}
