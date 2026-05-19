/**
 * Typed billing errors.
 *
 * Kept in a plain (non-"use server") module so they can be imported by
 * both "use server" files and regular server/client code alike.
 * "use server" modules can only export async functions, so these classes
 * must live separately.
 */

import type { Plan } from "@/lib/plans";

export class PlanLimitExceeded extends Error {
  constructor(
    public readonly resource: string,
    public readonly limit: number,
    public readonly plan: Plan,
  ) {
    super(
      `Your ${plan} plan allows up to ${limit === -1 ? "unlimited" : limit} ${resource}. ` +
        `Upgrade to increase this limit.`,
    );
    this.name = "PlanLimitExceeded";
  }
}

export class FeatureNotAvailable extends Error {
  constructor(
    public readonly feature: string,
    public readonly plan: Plan,
  ) {
    super(
      `The "${feature}" feature is not available on the ${plan} plan. ` +
        `Upgrade to unlock it.`,
    );
    this.name = "FeatureNotAvailable";
  }
}
