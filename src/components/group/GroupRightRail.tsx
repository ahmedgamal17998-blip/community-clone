/**
 * Right rail widget — cover banner + stats + description + online avatars.
 *
 * Shows:
 *   • Cover image OR gradient banner (admin-configurable)
 *   • Group name overlay
 *   • Stats: Posts · Members · Online (real count)
 *   • Real online members avatar stack (live from Presence)
 *   • Group description (no other meta — kept simple per design principle)
 */
import { getTranslations } from "next-intl/server";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";

type OnlineMember = {
  id: string;
  name: string | null;
  image: string | null;
};

type Props = {
  memberCount: number;
  postCount: number;
  onlineCount: number;
  name: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  primaryHsl?: string | null;
  description?: string | null;
  onlineMembers?: OnlineMember[];
  extraOnlineCount?: number;
};

export async function GroupRightRail({
  memberCount,
  postCount,
  onlineCount,
  name,
  logoUrl,
  coverUrl,
  primaryHsl,
  description,
  onlineMembers = [],
  extraOnlineCount = 0,
}: Props) {
  const t = await getTranslations("groups");

  // Build gradient from group's primaryHsl, fallback to a purple
  const hsl = primaryHsl ?? "260 70% 50%";
  const [h, s, l] = hsl.split(" ");
  const gradientStyle = {
    background: `linear-gradient(135deg, hsl(${h} ${s} ${l}) 0%, hsl(${h} ${s} ${parseInt(l ?? "50") - 12}%) 100%)`,
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)]">
        {/* Cover banner: image when set, otherwise the gradient fallback */}
        <div
          className="relative flex h-24 items-end px-4 pb-3"
          style={coverUrl ? undefined : gradientStyle}
          aria-hidden
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="absolute left-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full border-2 border-white/60 object-cover shadow"
            />
          ) : null}
          <span className="relative z-10 ml-14 truncate text-sm font-bold text-white drop-shadow">
            {name}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-around border-b border-border px-4 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-bold tabular-nums">
              {postCount.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">Posts</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-bold tabular-nums">
              {memberCount.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">{t("rail.members")}</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {onlineCount.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">Online</span>
          </div>
        </div>

        {/* Online member avatar stack */}
        {onlineMembers.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <div className="flex -space-x-2">
              {onlineMembers.slice(0, 6).map((m) => (
                <div key={m.id} className="relative">
                  <Avatar className="h-7 w-7 ring-2 ring-card">
                    {m.image ? <AvatarImage src={m.image} alt={m.name ?? ""} /> : null}
                    <AvatarFallback className="text-[10px]">
                      {initialsFrom(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Green online dot — these are actually online (last 5 min) */}
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 ring-1 ring-card" />
                </div>
              ))}
              {extraOnlineCount > 0 && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white ring-2 ring-card">
                  +{extraOnlineCount}
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {onlineCount} online now
            </span>
          </div>
        )}

        {/* Description only — meta rows removed per design principle (uncluttered) */}
        {description ? (
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("rail.about")}
            </h3>
            <p className="mt-1.5 text-sm text-foreground/80 leading-relaxed">
              {description}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
