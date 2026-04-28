/**
 * Right rail widget — Facebook-style cover banner + stats + about.
 */
import { getTranslations } from "next-intl/server";
import { Users, Lock, Globe, EyeOff, CalendarDays, FileText } from "lucide-react";

type Props = {
  memberCount: number;
  visibility: string;
  createdAt: Date;
  name: string;
  logoUrl?: string | null;
  primaryHsl?: string | null;
  description?: string | null;
  postCount?: number | null;
};

export async function GroupRightRail({
  memberCount,
  visibility,
  createdAt,
  name,
  logoUrl,
  primaryHsl,
  description,
  postCount,
}: Props) {
  const t = await getTranslations("groups");
  const VisibilityIcon =
    visibility === "PUBLIC" ? Globe
    : visibility === "PRIVATE" ? Lock
    : EyeOff;

  // Build gradient from group's primaryHsl, fallback to a purple
  const hsl = primaryHsl ?? "260 70% 50%";
  const [h, s, l] = hsl.split(" ");
  const gradientStyle = {
    background: `linear-gradient(135deg, hsl(${h} ${s} ${l}) 0%, hsl(${h} ${s} ${parseInt(l ?? "50") - 12}%) 100%)`,
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)]">
        {/* Cover banner */}
        <div
          className="relative flex h-24 items-end px-4 pb-3"
          style={gradientStyle}
          aria-hidden
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="absolute left-4 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border-2 border-white/60 object-cover shadow"
            />
          ) : null}
          <span className="ml-14 truncate text-sm font-bold text-white drop-shadow">
            {name}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-around border-b border-border px-4 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-bold">
              {postCount != null ? postCount.toLocaleString() : "—"}
            </span>
            <span className="text-[11px] text-muted-foreground">Posts</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-bold">{memberCount.toLocaleString()}</span>
            <span className="text-[11px] text-muted-foreground">{t("rail.members")}</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex items-center gap-1 text-sm font-bold">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Online
            </span>
            <span className="text-[11px] text-muted-foreground">Active</span>
          </div>
        </div>

        {/* About section */}
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("rail.about")}
          </h3>
          {description ? (
            <p className="mt-1.5 text-sm text-foreground/80 leading-relaxed line-clamp-3">
              {description}
            </p>
          ) : null}
          <dl className="mt-2.5 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <VisibilityIcon className="h-4 w-4 shrink-0" />
              <dt className="sr-only">{t("rail.visibility")}</dt>
              <dd>{t(`visibility.${visibility.toLowerCase()}`)}</dd>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <dt className="sr-only">{t("rail.created")}</dt>
              <dd>{t("rail.createdAt", { date: new Date(createdAt).toLocaleDateString() })}</dd>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <dt className="sr-only">{t("rail.members")}</dt>
              <dd>{t("memberCount", { count: memberCount })}</dd>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <dt className="sr-only">Posts</dt>
              <dd>{postCount != null ? `${postCount.toLocaleString()} posts` : "— Posts"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
