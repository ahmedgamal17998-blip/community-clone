import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { timeAgo, cn } from "@/lib/utils";


const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
  egp: "E£",
  sar: "﷼",
  aed: "د.إ",
  kwd: "د.ك",
};

function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(0);
  const sym = CURRENCY_SYMBOLS[currency.toLowerCase()] ?? currency.toUpperCase();
  // Add thousand separators
  const formatted = amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sym}${formatted}`;
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

export default async function AdminOverviewPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  const group = await db.group.findUnique({
    where: { slug: params.slug },
    select: { id: true, slug: true },
  });
  if (!group || !session?.user) notFound();

  const now = new Date();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    activeMemberships,
    posts7d,
    adminsCount,
    pendingCount,
    activeSubs,
    cancelRequestedCount,
    groupGrants,
    recentJoins,
    recentPosts,
  ] = await Promise.all([
    // Total ACTIVE memberships in the group.
    db.groupMembership.findMany({
      where: { groupId: group.id, state: "ACTIVE" },
      select: { userId: true },
    }),
    db.post.count({
      where: {
        channel: { groupId: group.id },
        createdAt: { gte: since7d },
      },
    }),
    db.groupMembership.count({
      where: {
        groupId: group.id,
        state: "ACTIVE",
        role: { in: ["OWNER", "ADMIN"] },
      },
    }),
    db.groupMembership.count({
      where: { groupId: group.id, state: "REQUESTED" },
    }),
    // Active subscriptions — pull plan info too so we can compute MRR.
    db.subscription.findMany({
      where: {
        groupId: group.id,
        status: "ACTIVE",
        currentPeriodEnd: { gt: now },
      },
      select: {
        userId: true,
        cancelRequestedAt: true,
        plan: {
          select: {
            priceCents: true,
            durationDays: true,
            currency: true,
          },
        },
      },
    }),
    // Subscriptions that the user has asked to cancel — they'll churn at
    // period end. Worth surfacing as a churn signal.
    db.subscription.count({
      where: {
        groupId: group.id,
        status: "ACTIVE",
        currentPeriodEnd: { gt: now },
        cancelRequestedAt: { not: null },
      },
    }),
    // Group-level MemberAccess GRANT — covers trials (source=RULE) and any
    // admin-issued blanket access (source=MANUAL). Both count as "in trial /
    // on a free pass" for the dashboard summary.
    db.memberAccess.findMany({
      where: {
        groupId: group.id,
        resourceType: "GROUP",
        resourceId: group.id,
        mode: "GRANT",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { userId: true },
    }),
    db.groupMembership.findMany({
      where: { groupId: group.id, state: "ACTIVE" },
      orderBy: { joinedAt: "desc" },
      take: 20,
      include: {
        user: { select: { id: true, name: true, handle: true, image: true } },
      },
    }),
    db.post.findMany({
      where: { channel: { groupId: group.id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        author: { select: { id: true, name: true, handle: true } },
        channel: { select: { slug: true, name: true } },
      },
    }),
  ]);

  // ─── Bucket the active membership ────────────────────────────────────────
  const totalActive = activeMemberships.length;
  const activeUserSet = new Set(activeMemberships.map((m) => m.userId));

  // "On a plan" — distinct active subscribers who are also ACTIVE members.
  const onPlanIds = new Set<string>();
  for (const s of activeSubs) {
    if (activeUserSet.has(s.userId)) onPlanIds.add(s.userId);
  }
  const onPlan = onPlanIds.size;

  // "On trial / free pass" — group-level GRANT holders who are ACTIVE
  // members BUT NOT already counted as paying. Plan grants take precedence
  // because a paying user with a trial leftover is best classified by
  // their payment.
  const trialIds = new Set<string>();
  for (const g of groupGrants) {
    if (activeUserSet.has(g.userId) && !onPlanIds.has(g.userId)) {
      trialIds.add(g.userId);
    }
  }
  const onTrial = trialIds.size;

  // "Inactive" — ACTIVE membership but no payment, no group grant, no trial.
  // Maps to "free-loading" / engaged-but-not-monetized.
  const inactive = Math.max(0, totalActive - onPlan - onTrial);

  // ─── MRR (monthly recurring revenue) ─────────────────────────────────────
  // Normalize each active sub's plan price to a monthly figure
  // (priceCents × 30 / durationDays). Group by currency so multi-currency
  // groups don't get nonsense totals; surface the dominant currency.
  const mrrByCurrency: Record<string, number> = {};
  const currencyVolume: Record<string, number> = {};
  for (const s of activeSubs) {
    const cur = (s.plan.currency || "usd").toLowerCase();
    const monthly = Math.round(
      (s.plan.priceCents * 30) / Math.max(1, s.plan.durationDays),
    );
    mrrByCurrency[cur] = (mrrByCurrency[cur] ?? 0) + monthly;
    currencyVolume[cur] = (currencyVolume[cur] ?? 0) + 1;
  }
  const dominantCurrency =
    Object.entries(currencyVolume).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "usd";
  const mrrCents = mrrByCurrency[dominantCurrency] ?? 0;

  const planPct = pct(onPlan, totalActive);
  const trialPct = pct(onTrial, totalActive);
  const inactivePct = Math.max(0, 100 - planPct - trialPct);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Admin overview</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of activity in this group.
        </p>
      </div>

      {/* ── Membership breakdown ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Total members" value={totalActive} />
        <Tile
          label="On a plan"
          value={onPlan}
          accent="primary"
          sub={totalActive > 0 ? `${planPct}% of total` : undefined}
        />
        <Tile
          label="On trial"
          value={onTrial}
          accent="amber"
          sub={totalActive > 0 ? `${trialPct}% of total` : undefined}
        />
        <Tile
          label="Inactive"
          value={inactive}
          accent="muted"
          sub={totalActive > 0 ? `${inactivePct}% of total` : undefined}
        />
      </div>

      {totalActive > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">
              Membership mix
            </span>
            <span className="text-muted-foreground">
              {totalActive} active member{totalActive === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {planPct > 0 && (
              <div
                className="h-full bg-primary"
                style={{ width: `${planPct}%` }}
                title={`On plan — ${onPlan} (${planPct}%)`}
              />
            )}
            {trialPct > 0 && (
              <div
                className="h-full bg-amber-500"
                style={{ width: `${trialPct}%` }}
                title={`On trial — ${onTrial} (${trialPct}%)`}
              />
            )}
            {inactivePct > 0 && (
              <div
                className="h-full bg-muted-foreground/30"
                style={{ width: `${inactivePct}%` }}
                title={`Inactive — ${inactive} (${inactivePct}%)`}
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs">
            <Legend color="bg-primary" label={`On plan ${planPct}%`} />
            <Legend
              color="bg-amber-500"
              label={`On trial ${trialPct}%`}
            />
            <Legend
              color="bg-muted-foreground/30"
              label={`Inactive ${inactivePct}%`}
            />
          </div>
        </div>
      ) : null}

      {/* ── Ops tiles ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="MRR"
          value={formatMoney(mrrCents, dominantCurrency)}
          sub={
            Object.keys(currencyVolume).length > 1
              ? `${dominantCurrency.toUpperCase()} subs only`
              : undefined
          }
        />
        <Tile
          label="Cancels pending"
          value={cancelRequestedCount}
          accent={cancelRequestedCount > 0 ? "amber" : undefined}
          sub={
            cancelRequestedCount > 0
              ? "Will churn at period end"
              : undefined
          }
        />
        <Tile label="Posts (7d)" value={posts7d} />
        <Tile
          label="Pending requests"
          value={pendingCount}
          accent={pendingCount > 0 ? "primary" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-3 text-sm font-semibold">
            <span>Recent joins</span>
            <span className="text-xs font-normal text-muted-foreground">
              {adminsCount} admin{adminsCount === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {recentJoins.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">No joins yet.</li>
            ) : (
              recentJoins.map((m) => (
                <li key={m.id} className="flex items-center gap-2 p-3 text-sm">
                  <Link
                    href={`/profile/${m.user.handle}`}
                    className="hover:underline"
                  >
                    {m.user.name ?? `@${m.user.handle}`}
                  </Link>
                  <span className="ms-auto text-xs text-muted-foreground">
                    {timeAgo(m.joinedAt)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3 text-sm font-semibold">
            Recent posts
          </div>
          <ul className="divide-y divide-border">
            {recentPosts.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">No posts yet.</li>
            ) : (
              recentPosts.map((p) => (
                <li key={p.id} className="p-3 text-sm">
                  <Link
                    href={`/groups/${group.slug}/channels/${p.channel.slug}#post-${p.id}`}
                    className="line-clamp-1 hover:underline"
                  >
                    {p.title ?? p.body.slice(0, 80)}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>@{p.author.handle}</span>
                    <span>·</span>
                    <span>#{p.channel.name}</span>
                    <span>·</span>
                    <span>{timeAgo(p.createdAt)}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─── Small UI helpers ─────────────────────────────────────────────────────

type TileAccent = "primary" | "amber" | "muted";

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: TileAccent;
}) {
  const accentCls =
    accent === "primary"
      ? "text-primary"
      : accent === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : accent === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", accentCls)}>
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("inline-block h-2 w-2 rounded-full", color)} />
      {label}
    </span>
  );
}
