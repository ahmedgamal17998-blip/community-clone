import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  priceType: string; // FREE | PAID
  priceLabel?: string | null;
  priceAmount?: number | null;
  currency?: string | null;
  published: boolean;
  progressPercent: number;
  enrolled?: boolean;
  /** Set true when the viewer has been explicitly locked out of this course
   *  (admin DENY in the per-member access matrix). Renders dimmed,
   *  non-clickable and shows a lock badge. */
  accessLocked?: boolean;
};

export function CourseCard({
  href,
  title,
  description,
  coverUrl,
  priceType,
  priceLabel,
  priceAmount,
  currency,
  published,
  progressPercent,
  enrolled,
  accessLocked,
}: Props) {
  const isPaid = priceType === "PAID";
  const isPayLocked = isPaid && !enrolled;
  const isLocked = isPayLocked || accessLocked;

  const priceDisplay =
    priceAmount != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency ?? "usd",
        }).format(priceAmount / 100)
      : priceLabel ?? null;

  // Access-locked: render the same card but dimmed, non-clickable.
  if (accessLocked) {
    return (
      <div
        className="group flex cursor-not-allowed flex-col overflow-hidden rounded-xl border border-border bg-card opacity-60 shadow-sm"
        aria-disabled="true"
        title="You don't have access to this course"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover grayscale" />
          ) : (
            <div
              className="h-full w-full grayscale"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(263 74% 38%) 100%)",
              }}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Lock className="h-8 w-8 text-white/90" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-2 text-sm font-semibold text-muted-foreground line-through decoration-muted-foreground/40">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">Access locked</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(263 74% 38%) 100%)",
            }}
          />
        )}
        {/* Lock overlay for paid+unenrolled */}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Lock className="h-8 w-8 text-white/80" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {isPaid ? (
            <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {priceDisplay ?? "Paid"}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Free
            </span>
          )}
          {enrolled && isPaid ? (
            <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Enrolled
            </span>
          ) : null}
          {!published ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
              Draft
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
        ) : null}
        {progressPercent > 0 ? (
          <div className="mt-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {progressPercent}% complete
            </p>
          </div>
        ) : null}
        <div className="mt-auto pt-2">
          <Button asChild size="sm" className={cn("w-full", isLocked && "opacity-70")}>
            <Link href={href}>{isPaid && !enrolled ? "View" : "Open"}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
