/**
 * Square-ish group tile: if logoUrl present, show image; else show a tinted
 * block with initials. Color pulls from the group's primaryHsl.
 */
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logoUrl?: string | null;
  primaryHsl?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "G";
}

export function GroupAvatar({ name, logoUrl, primaryHsl, className, size = "md" }: Props) {
  const sizeCls =
    size === "sm" ? "h-7 w-7 text-[10px]"
    : size === "lg" ? "h-12 w-12 text-base"
    : "h-9 w-9 text-xs";

  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoUrl}
        alt={name}
        className={cn("rounded-md object-cover", sizeCls, className)}
      />
    );
  }

  const style = primaryHsl
    ? { backgroundColor: `hsl(${primaryHsl})`, color: "white" }
    : undefined;

  return (
    <div
      style={style}
      className={cn(
        "flex items-center justify-center rounded-md font-semibold",
        !style && "bg-primary text-primary-foreground",
        sizeCls,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
