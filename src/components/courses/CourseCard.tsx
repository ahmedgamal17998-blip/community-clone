import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  priceType: string; // FREE | PAID
  priceLabel?: string | null;
  published: boolean;
  progressPercent: number;
};

export function CourseCard({
  href,
  title,
  description,
  coverUrl,
  priceType,
  priceLabel,
  published,
  progressPercent,
}: Props) {
  const isPaid = priceType === "PAID";
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
        <div className="absolute left-2 top-2 flex gap-1">
          {isPaid ? (
            <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Paid — Coming soon
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Free
            </span>
          )}
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
          <Button asChild size="sm" className={cn("w-full", isPaid && "opacity-70")}>
            <Link href={href}>{isPaid ? "View" : "Open"}</Link>
          </Button>
          {isPaid && priceLabel ? (
            <p className="mt-1 text-center text-[10px] text-muted-foreground">{priceLabel}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
