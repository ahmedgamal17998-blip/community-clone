/**
 * Right rail widget — matches the stats card from the audit.
 * Static in M2; will light up with live counts in M4+.
 */
import { getTranslations } from "next-intl/server";
import { Users, Lock, Globe, EyeOff, CalendarDays } from "lucide-react";

type Props = {
  memberCount: number;
  visibility: string;
  createdAt: Date;
};

export async function GroupRightRail({ memberCount, visibility, createdAt }: Props) {
  const t = await getTranslations("groups");
  const VisibilityIcon =
    visibility === "PUBLIC" ? Globe
    : visibility === "PRIVATE" ? Lock
    : EyeOff;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">{t("rail.about")}</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <dt className="sr-only">{t("rail.members")}</dt>
            <dd>{t("memberCount", { count: memberCount })}</dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <VisibilityIcon className="h-4 w-4" />
            <dt className="sr-only">{t("rail.visibility")}</dt>
            <dd>{t(`visibility.${visibility.toLowerCase()}`)}</dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <dt className="sr-only">{t("rail.created")}</dt>
            <dd>{t("rail.createdAt", { date: new Date(createdAt).toLocaleDateString() })}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
