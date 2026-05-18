/**
 * /pricing — Public pricing page.
 * Reads plan configs live from the DB so super-admin edits reflect immediately.
 */
import Link from "next/link";
import { Check, Zap, Building2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPlanConfigs } from "@/server/plan-configs";
import type { PlanConfigRow } from "@/server/plan-configs";

// Icon map — plans don't store icons in DB, map by key
const PLAN_ICON: Record<string, React.ElementType> = {
  STARTER:  Rocket,
  PRO:      Zap,
  BUSINESS: Building2,
};

const PLAN_FEATURED: Record<string, boolean> = {
  PRO: true,
};

function formatPrice(cents: number): { main: string; note: string } {
  if (cents === 0) return { main: "Free", note: "14-day trial, no credit card" };
  return { main: `$${(cents / 100).toFixed(0)}`, note: "per month" };
}

function formatLimit(n: number): string {
  return n === -1 ? "Unlimited" : String(n);
}

function getCta(plan: string): string {
  if (plan === "BUSINESS") return "Contact sales";
  if (plan === "PRO") return "Get started";
  return "Start free trial";
}

export default async function PricingPage() {
  const plans = await getPlanConfigs();
  const visible = plans.filter((p) => p.isVisible);

  return (
    <div className="mx-auto max-w-5xl space-y-12 py-16 px-4">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Start free, upgrade when you grow. No hidden fees, no surprises.
        </p>
      </div>

      {/* Plans grid */}
      <div className={cn(
        "grid grid-cols-1 gap-6",
        visible.length === 3 ? "sm:grid-cols-3" : visible.length === 2 ? "sm:grid-cols-2 sm:max-w-2xl sm:mx-auto" : "sm:max-w-sm sm:mx-auto",
      )}>
        {visible.map((plan) => {
          const Icon = PLAN_ICON[plan.plan] ?? Rocket;
          const featured = PLAN_FEATURED[plan.plan] ?? false;
          const { main: priceMain, note: priceNote } = formatPrice(plan.monthlyPriceCents);
          const cta = getCta(plan.plan);

          return (
            <div
              key={plan.plan}
              className={cn(
                "relative flex flex-col rounded-3xl border p-6 shadow-sm",
                featured
                  ? "border-primary bg-primary/5 shadow-primary/10 shadow-lg"
                  : "border-border bg-card",
              )}
            >
              {featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-5">
                <div className={cn(
                  "mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl",
                  featured ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold">{plan.label}</h2>
              </div>

              <div className="mb-6">
                <span className="text-3xl font-bold">{priceMain}</span>
                <span className="ml-1.5 text-sm text-muted-foreground">{priceNote}</span>
                {plan.yearlyPriceCents > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    or ${(plan.yearlyPriceCents / 100).toFixed(0)}/yr — save {Math.round((1 - plan.yearlyPriceCents / (plan.monthlyPriceCents * 12)) * 100)}%
                  </p>
                )}
              </div>

              {/* Quick limits */}
              <div className="mb-5 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-muted/50 p-3 text-xs">
                <div className="flex items-center justify-between col-span-2 border-b border-border pb-1 mb-0.5">
                  <span className="text-muted-foreground">Groups</span>
                  <span className="font-semibold">{formatLimit(plan.maxGroups)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Members</span>
                  <span className="font-semibold">{formatLimit(plan.maxMembersPerGroup)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Courses</span>
                  <span className="font-semibold">{formatLimit(plan.maxCourses)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Storage</span>
                  <span className="font-semibold">{plan.maxStorageGb} GB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Team seats</span>
                  <span className="font-semibold">{plan.maxTeamMembers === 0 ? "—" : String(plan.maxTeamMembers)}</span>
                </div>
              </div>

              {/* Features */}
              <ul className="mb-8 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      featured ? "text-primary" : "text-muted-foreground",
                    )} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={featured ? "default" : "outline"}
                className="w-full"
              >
                <Link href={plan.plan === "BUSINESS" ? "mailto:support@nadi.app" : "/admin/setup"}>
                  {cta}
                </Link>
              </Button>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center space-y-1">
        <p className="text-sm font-medium">All plans include a 14-day free trial</p>
        <p className="text-xs text-muted-foreground">
          Questions? Contact{" "}
          <a href="mailto:support@nadi.app" className="text-primary hover:underline">
            support@nadi.app
          </a>
        </p>
      </div>
    </div>
  );
}
